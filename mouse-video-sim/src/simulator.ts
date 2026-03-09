import { chromium, Browser, Page, BrowserContext, Cookie } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ParsedScenario, BrowserAction, SimulationProgress, MouseConfig, DEFAULT_MOUSE_CONFIG } from './types';
import { parseInstructions } from './instruction-parser';
import { findElement } from './element-finder';
import { analyzePage, formatPageAnalysis } from './page-analyzer';
import {
  CURSOR_INJECT_SCRIPT,
  generateBezierPath,
  calculateMoveDuration,
} from './mouse-helper';

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

export class Simulator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cursorX = 0;
  private cursorY = 0;
  private onProgress: (progress: SimulationProgress) => void;
  private mouseConfig: MouseConfig;

  constructor(
    onProgress?: (progress: SimulationProgress) => void,
    mouseConfig?: Partial<MouseConfig>
  ) {
    this.onProgress = onProgress || (() => {});
    this.mouseConfig = { ...DEFAULT_MOUSE_CONFIG, ...mouseConfig };
  }

  async run(
    url: string,
    instructions: string,
    width: number = 1280,
    height: number = 720,
    hasProfileContext: boolean = false,
    cookies?: Cookie[]
  ): Promise<string> {
    const jobId = uuidv4();
    const videoDir = path.join(OUTPUT_DIR, jobId);

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    fs.mkdirSync(videoDir, { recursive: true });

    try {
      // Step 1: Launch browser and load the page (without recording yet)
      this.onProgress({
        status: 'launching',
        message: 'Launching browser and loading page...',
      });

      this.browser = await chromium.launch({
        headless: true,
      });

      let pageContext: string | undefined;
      let screenshotBase64: string | undefined;

      if (hasProfileContext) {
        // Profile context was already injected into instructions — skip live analysis
        this.onProgress({
          status: 'parsing',
          message: 'Using saved site profile (skipping live scan)...',
        });
      } else {
        // First context: load the page and analyze it (no video recording)
        const analyzeContext = await this.browser.newContext({
          viewport: { width, height },
        });
        if (cookies && cookies.length > 0) {
          await analyzeContext.addCookies(cookies);
        }
        const analyzePage_ = await analyzeContext.newPage();

        await analyzePage_.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await analyzePage_.waitForLoadState('networkidle').catch(() => {});

        // Step 2: Analyze the page — extract all interactive elements + screenshot
        this.onProgress({
          status: 'parsing',
          message: 'Analyzing page structure and elements...',
        });

        const analysis = await analyzePage(analyzePage_);
        pageContext = formatPageAnalysis(analysis);
        screenshotBase64 = analysis.screenshotBase64;

        console.log('Page analysis:\n', pageContext);
        console.log(`Found ${analysis.elements.length} interactive elements`);

        await analyzeContext.close();
      }

      // Send page analysis + instructions to Claude
      this.onProgress({
        status: 'parsing',
        message: 'Interpreting your instructions with page context...',
      });

      const scenario = await parseInstructions(
        url,
        instructions,
        pageContext,
        screenshotBase64
      );
      console.log(
        'Parsed actions:',
        JSON.stringify(scenario.actions, null, 2)
      );

      // Step 4: Create recording context and execute actions
      this.onProgress({
        status: 'launching',
        message: 'Starting video recording...',
      });

      this.context = await this.browser.newContext({
        viewport: { width, height },
        recordVideo: {
          dir: videoDir,
          size: { width, height },
        },
      });

      if (cookies && cookies.length > 0) {
        await this.context.addCookies(cookies);
      }

      this.page = await this.context.newPage();

      // Inject cursor overlay
      await this.page.addInitScript(CURSOR_INJECT_SCRIPT);

      // Navigate to starting URL
      this.onProgress({
        status: 'executing',
        currentAction: 0,
        totalActions: scenario.actions.length,
        message: `Navigating to ${scenario.startUrl}...`,
      });

      await this.page.goto(scenario.startUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.ensureCursor();

      // Small initial pause
      await this.sleep(1000);

      // Execute each action
      for (let i = 0; i < scenario.actions.length; i++) {
        const action = scenario.actions[i];
        this.onProgress({
          status: 'executing',
          currentAction: i + 1,
          totalActions: scenario.actions.length,
          message: `Executing: ${this.describeAction(action)}`,
        });

        await this.executeAction(action);
        await this.ensureCursor();

        // Configurable pause between actions with some randomness
        const baseDelay = this.mouseConfig.actionDelay;
        await this.sleep(baseDelay * 0.6 + Math.random() * baseDelay * 0.8);
      }

      // Final pause at end
      await this.sleep(1500);

      // Close and get video
      this.onProgress({
        status: 'encoding',
        message: 'Encoding video...',
      });

      await this.page.close();
      const videoPath = await this.context.pages()[0]?.video()?.path();

      // The page we closed had the video — get it from the dir
      await this.context.close();
      await this.browser.close();

      // Find the recorded webm file
      const files = fs.readdirSync(videoDir);
      const webmFile = files.find((f) => f.endsWith('.webm'));

      if (!webmFile) {
        throw new Error('No video file was recorded');
      }

      const webmPath = path.join(videoDir, webmFile);
      const mp4Path = path.join(videoDir, 'output.mp4');

      // Convert webm to mp4 using ffmpeg
      await this.convertToMp4(webmPath, mp4Path);

      this.onProgress({
        status: 'done',
        message: 'Video ready!',
      });

      return mp4Path;
    } catch (error) {
      this.onProgress({
        status: 'error',
        message: `Error: ${(error as Error).message}`,
      });

      // Cleanup on error
      try {
        if (this.page) await this.page.close().catch(() => {});
        if (this.context) await this.context.close().catch(() => {});
        if (this.browser) await this.browser.close().catch(() => {});
      } catch {}

      throw error;
    }
  }

  private async ensureCursor() {
    if (!this.page) return;
    try {
      await this.page.evaluate(CURSOR_INJECT_SCRIPT);
    } catch {}
  }

  private async executeAction(action: BrowserAction): Promise<void> {
    if (!this.page) throw new Error('No page available');

    switch (action.type) {
      case 'navigate':
        if (action.url) {
          await this.page.goto(action.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await this.page.waitForLoadState('networkidle').catch(() => {});
        }
        break;

      case 'wait':
        await this.sleep(action.duration || 1000);
        break;

      case 'click': {
        const target = await findElement(
          this.page,
          action.selector,
          action.description
        );
        await this.moveMouseTo(target.x, target.y, target.width);
        await this.page.evaluate(
          `window.__clickSimCursor && window.__clickSimCursor(${target.x}, ${target.y})`
        );
        await this.page.mouse.click(target.x, target.y);
        await this.sleep(200);
        break;
      }

      case 'hover': {
        const hoverTarget = await findElement(
          this.page,
          action.selector,
          action.description
        );
        await this.moveMouseTo(
          hoverTarget.x,
          hoverTarget.y,
          hoverTarget.width
        );
        break;
      }

      case 'type': {
        // If there's a selector, click the input first
        if (action.selector || action.description) {
          try {
            const inputTarget = await findElement(
              this.page,
              action.selector,
              action.description
            );
            await this.moveMouseTo(
              inputTarget.x,
              inputTarget.y,
              inputTarget.width
            );
            await this.page.mouse.click(inputTarget.x, inputTarget.y);
            await this.sleep(200);
          } catch {
            // If we can't find the element, type into whatever is focused
          }
        }
        if (action.text) {
          // Configurable typing speed with randomness
          const baseDelay = this.mouseConfig.typingDelay;
          for (const char of action.text) {
            await this.page.keyboard.type(char, {
              delay: baseDelay * 0.6 + Math.random() * baseDelay * 0.8,
            });
          }
        }
        break;
      }

      case 'scroll':
        await this.page.mouse.wheel(
          0,
          action.scrollDirection === 'up'
            ? -(action.scrollAmount || 300)
            : action.scrollAmount || 300
        );
        await this.sleep(500);
        break;
    }
  }

  private async moveMouseTo(
    targetX: number,
    targetY: number,
    targetWidth: number = 40
  ): Promise<void> {
    if (!this.page) return;

    const distance = Math.sqrt(
      (targetX - this.cursorX) ** 2 + (targetY - this.cursorY) ** 2
    );

    const movePath = generateBezierPath(
      this.cursorX,
      this.cursorY,
      targetX,
      targetY,
      this.mouseConfig
    );
    const duration = calculateMoveDuration(distance, targetWidth, this.mouseConfig.speed);
    const stepDelay = duration / movePath.length;

    for (const point of movePath) {
      await this.page.mouse.move(point.x, point.y);
      await this.page.evaluate(
        `window.__moveSimCursor && window.__moveSimCursor(${point.x}, ${point.y})`
      );
      await this.sleep(stepDelay);
    }

    this.cursorX = targetX;
    this.cursorY = targetY;
  }

  private describeAction(action: BrowserAction): string {
    switch (action.type) {
      case 'click':
        return `Click on ${action.description || action.selector}`;
      case 'type':
        return `Type "${action.text?.substring(0, 30)}..."`;
      case 'wait':
        return `Wait ${action.duration}ms`;
      case 'scroll':
        return `Scroll ${action.scrollDirection}`;
      case 'hover':
        return `Hover over ${action.description || action.selector}`;
      case 'navigate':
        return `Navigate to ${action.url}`;
      default:
        return `${action.type}`;
    }
  }

  private async convertToMp4(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    const { execSync } = require('child_process');
    try {
      execSync(
        `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -movflags +faststart -y "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
    } catch (error) {
      // If ffmpeg is not available, just rename the webm
      console.warn(
        'ffmpeg not available, outputting webm instead of mp4:',
        (error as Error).message
      );
      fs.copyFileSync(inputPath, outputPath.replace('.mp4', '.webm'));
      throw new Error(
        'ffmpeg is required for MP4 output. Install it with: sudo apt install ffmpeg'
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

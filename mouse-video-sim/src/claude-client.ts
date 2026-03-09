import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Calls Claude via the `claude` CLI (Claude Code), which is included with
 * Claude Max subscriptions — no separate API key required.
 *
 * Uses `claude -p` (print mode) for non-interactive single-prompt calls.
 */
export function askClaude(prompt: string, screenshotPath?: string): string {
  const args = ['-p', prompt, '--output-format', 'text'];

  const result = execFileSync('claude', args, {
    encoding: 'utf-8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return result.trim();
}

/**
 * Saves a base64-encoded PNG screenshot to a temp file and returns the path.
 * The caller is responsible for cleanup.
 */
export function saveScreenshotToTemp(base64Data: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `mvs-screenshot-${Date.now()}.png`);
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  return filePath;
}

/**
 * Cleans up a temp screenshot file.
 */
export function cleanupTemp(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

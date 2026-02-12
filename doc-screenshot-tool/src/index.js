#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');

const { launchBrowser, authenticateManually, navigateTo } = require('./browser');
const { crawlSite, discoverInteractiveElements } = require('./crawler');
const {
  captureFullPage,
  captureSections,
  triggerLazyContent,
  captureInteractiveStates,
} = require('./screenshotter');
const { categorizeAll, detectPageType } = require('./categorizer');
const {
  buildScreenshotPath,
  buildSectionScreenshotPath,
  writeManifest,
  delay,
} = require('./utils');

// ---------------------------------------------------------------------------
// CLI Definition
// ---------------------------------------------------------------------------

program
  .name('doc-screenshots')
  .description('Automated web app screenshot tool for documentation writing')
  .argument('<url>', 'The starting URL of the web application')
  .option('-o, --output <dir>', 'Output directory for screenshots', './screenshots')
  .option('-d, --max-depth <n>', 'Maximum crawl depth from start page', '5')
  .option('-p, --max-pages <n>', 'Maximum number of pages to capture', '100')
  .option('--headless', 'Run in headless mode (skip manual auth)', false)
  .option('--sections', 'Also capture individual page sections', false)
  .option('--interactive', 'Capture interactive states (tabs, accordions)', false)
  .option('--viewport <WxH>', 'Browser viewport size', '1920x1080')
  .option('--exclude <patterns>', 'Comma-separated URL substrings to skip', '')
  .option('--include <patterns>', 'Comma-separated URL substrings to include (whitelist)', '')
  .option('--delay <ms>', 'Extra delay (ms) between page navigations', '500')
  .option('--user-data-dir <dir>', 'Persistent browser profile directory for session reuse')
  .action(run);

program.parse();

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function run(startUrl, opts) {
  const outputDir = path.resolve(opts.output);
  const [vpW, vpH] = opts.viewport.split('x').map(Number);
  const maxDepth = parseInt(opts.maxDepth, 10);
  const maxPages = parseInt(opts.maxPages, 10);
  const extraDelay = parseInt(opts.delay, 10);

  const excludePatterns = opts.exclude
    ? opts.exclude.split(',').map((s) => s.trim())
    : ['logout', 'signout', 'sign-out', 'log-out', '/api/', '/auth/callback'];
  const includePatterns = opts.include
    ? opts.include.split(',').map((s) => s.trim())
    : [];

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(chalk.bold.cyan('\n  ╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║   Doc Screenshot Tool                 ║'));
  console.log(chalk.bold.cyan('  ╚═══════════════════════════════════════╝\n'));
  console.log(chalk.gray(`  URL:        ${startUrl}`));
  console.log(chalk.gray(`  Output:     ${outputDir}`));
  console.log(chalk.gray(`  Max Depth:  ${maxDepth}`));
  console.log(chalk.gray(`  Max Pages:  ${maxPages}`));
  console.log(chalk.gray(`  Viewport:   ${vpW}x${vpH}`));
  console.log(chalk.gray(`  Sections:   ${opts.sections ? 'yes' : 'no'}`));
  console.log(chalk.gray(`  Interactive: ${opts.interactive ? 'yes' : 'no'}`));
  console.log('');

  // ── Launch browser ──────────────────────────────────────────────────
  const spinner = ora('Launching browser...').start();

  const { browser, context, page } = await launchBrowser({
    headless: opts.headless,
    viewport: { width: vpW, height: vpH },
    userDataDir: opts.userDataDir,
  });

  spinner.succeed('Browser launched');

  // ── Authentication ──────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (!opts.headless) {
    await authenticateManually(page, startUrl, rl);
  } else {
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });
  }

  const baseUrl = new URL(page.url()).origin;
  console.log(chalk.green(`\n  ✓ Authenticated. Base URL: ${baseUrl}\n`));

  // ── Crawl ───────────────────────────────────────────────────────────
  const crawlSpinner = ora('Crawling site — discovering pages...').start();

  const pages = await crawlSite(page, baseUrl, {
    maxPages,
    maxDepth,
    excludePatterns,
    includePatterns,
  });

  crawlSpinner.succeed(`Discovered ${pages.size} pages`);

  // ── Categorize ──────────────────────────────────────────────────────
  const categorized = categorizeAll(pages);
  console.log(chalk.cyan('\n  Categories discovered:'));
  for (const [cat, pageList] of categorized) {
    console.log(chalk.gray(`    ${cat} (${pageList.length} pages)`));
  }
  console.log('');

  // ── Screenshot ──────────────────────────────────────────────────────
  const manifest = {
    baseUrl,
    startUrl,
    capturedAt: new Date().toISOString(),
    viewport: { width: vpW, height: vpH },
    totalPages: pages.size,
    categories: {},
    pages: [],
  };

  let pageIndex = 0;
  for (const [url, pageInfo] of pages) {
    pageIndex++;
    const label = `[${pageIndex}/${pages.size}] ${pageInfo.category}: ${pageInfo.title || url}`;
    const pageSpinner = ora(label).start();

    try {
      await navigateTo(page, url, baseUrl);
      await delay(extraDelay);

      // Trigger lazy content
      await triggerLazyContent(page);

      // Detect page type for the manifest
      const pageType = await detectPageType(page);

      // Full-page screenshot
      const fullPagePath = buildScreenshotPath(outputDir, pageInfo.category, url, baseUrl);
      await captureFullPage(page, fullPagePath);

      const pageEntry = {
        url,
        title: pageInfo.title,
        category: pageInfo.category,
        depth: pageInfo.depth,
        pageTypes: pageType.types,
        screenshots: {
          fullPage: path.relative(outputDir, fullPagePath),
        },
        sections: [],
        interactiveStates: [],
      };

      // Section screenshots
      if (opts.sections) {
        const sectionPathBuilder = (sectionName) =>
          buildSectionScreenshotPath(outputDir, pageInfo.category, url, baseUrl, sectionName);

        const sections = await captureSections(page, sectionPathBuilder);
        pageEntry.sections = sections.map((s) => ({
          name: s.name,
          path: path.relative(outputDir, s.path),
        }));
      }

      // Interactive state screenshots
      if (opts.interactive && pageInfo.interactiveElements?.length > 0) {
        const interactivePath = (name) =>
          buildScreenshotPath(outputDir, pageInfo.category, url, baseUrl, name);

        const states = await captureInteractiveStates(
          page,
          pageInfo.interactiveElements,
          interactivePath
        );
        pageEntry.interactiveStates = states.map((s) => ({
          name: s.name,
          type: s.type,
          path: path.relative(outputDir, s.path),
        }));
      }

      // Add to manifest
      manifest.pages.push(pageEntry);
      if (!manifest.categories[pageInfo.category]) {
        manifest.categories[pageInfo.category] = { count: 0, pages: [] };
      }
      manifest.categories[pageInfo.category].count++;
      manifest.categories[pageInfo.category].pages.push(url);

      pageSpinner.succeed(label);
    } catch (err) {
      pageSpinner.fail(`${label} — ${err.message}`);
    }
  }

  // ── Write manifest ──────────────────────────────────────────────────
  const manifestPath = writeManifest(outputDir, manifest);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(chalk.bold.cyan('\n  ╔═══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║   Capture Complete                    ║'));
  console.log(chalk.bold.cyan('  ╚═══════════════════════════════════════╝\n'));
  console.log(chalk.green(`  Total pages captured:  ${manifest.pages.length}`));
  console.log(chalk.green(`  Categories:            ${Object.keys(manifest.categories).length}`));
  console.log(chalk.green(`  Output directory:      ${outputDir}`));
  console.log(chalk.green(`  Manifest:              ${manifestPath}`));

  const totalScreenshots =
    manifest.pages.length +
    manifest.pages.reduce((sum, p) => sum + p.sections.length, 0) +
    manifest.pages.reduce((sum, p) => sum + p.interactiveStates.length, 0);
  console.log(chalk.green(`  Total screenshots:     ${totalScreenshots}`));

  console.log(chalk.gray('\n  Directory structure:\n'));
  printDirectoryTree(outputDir, '    ');

  // ── Cleanup ─────────────────────────────────────────────────────────
  rl.close();
  await context.close();
  if (browser) {
    try { await browser.close(); } catch { /* persistent context */ }
  }

  console.log(chalk.gray('\n  Done. Browser closed.\n'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printDirectoryTree(dir, prefix = '', maxDepth = 4, depth = 0) {
  if (depth >= maxDepth) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // Directories first
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = entry.isDirectory() ? chalk.yellow('📁') : chalk.blue('📷');

    console.log(`${prefix}${connector}${icon} ${entry.name}`);

    if (entry.isDirectory()) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      printDirectoryTree(path.join(dir, entry.name), newPrefix, maxDepth, depth + 1);
    }
  }
}

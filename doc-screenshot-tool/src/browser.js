const { chromium } = require('playwright');
const { delay } = require('./utils');

/**
 * Launch a Chromium browser and return { browser, context, page }.
 *
 * The browser opens in headed (visible) mode so the user can
 * manually authenticate before the crawl begins.
 */
async function launchBrowser(options = {}) {
  const {
    headless = false,
    viewport = { width: 1920, height: 1080 },
    slowMo = 0,
    userDataDir = null,
  } = options;

  const launchOpts = {
    headless,
    slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  };

  let browser;
  let context;

  if (userDataDir) {
    // Persistent context keeps cookies/sessions across runs
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOpts,
      viewport,
      ignoreHTTPSErrors: true,
    });
    browser = context.browser();
  } else {
    browser = await chromium.launch(launchOpts);
    context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
    });
  }

  const page = context.pages()[0] || await context.newPage();
  return { browser, context, page };
}

/**
 * Navigate to the start URL and pause so the user can authenticate.
 * Returns once the user presses Enter in the terminal.
 */
async function authenticateManually(page, startUrl, readline) {
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('\n┌──────────────────────────────────────────────────┐');
  console.log('│  Browser is open. Please log in to the           │');
  console.log('│  application manually.                            │');
  console.log('│                                                   │');
  console.log('│  Once you are fully authenticated and can see     │');
  console.log('│  the main dashboard/home page, come back here     │');
  console.log('│  and press ENTER to start the crawl.              │');
  console.log('└──────────────────────────────────────────────────┘\n');

  await new Promise((resolve) => {
    readline.question('  ▸ Press ENTER when ready to begin crawling... ', () => {
      resolve();
    });
  });

  // Small delay to ensure any final redirects settle
  await delay(2000);
}

/**
 * Wait for the page to be fully loaded and stable.
 */
async function waitForPageStable(page, timeout = 15000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // networkidle can time out on long-polling pages; fall back to domcontentloaded
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    } catch {
      // page might already be loaded
    }
  }
  // Extra settle time for SPAs that render after network idle
  await delay(1500);
}

/**
 * Navigate to a URL, handling SPA routing and waiting for stability.
 */
async function navigateTo(page, url, baseUrl) {
  try {
    const currentUrl = page.url();
    if (currentUrl === url) {
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    } else {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    }
  } catch {
    // Timeout on goto is common for SPAs; attempt to wait for DOM
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    } catch {
      // continue anyway
    }
  }
  await waitForPageStable(page);
}

module.exports = {
  launchBrowser,
  authenticateManually,
  waitForPageStable,
  navigateTo,
};

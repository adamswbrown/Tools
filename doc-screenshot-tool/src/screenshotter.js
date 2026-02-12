const { delay } = require('./utils');
const { waitForPageStable } = require('./browser');

/**
 * Capture a full-page screenshot. Playwright's fullPage option handles
 * scrolling automatically — it stitches the entire scrollable area.
 */
async function captureFullPage(page, outputPath) {
  await waitForPageStable(page, 8000);

  // Close any modal overlays / cookie banners that might block content
  await dismissOverlays(page);

  await page.screenshot({
    path: outputPath,
    fullPage: true,
    type: 'png',
  });
}

/**
 * Capture a screenshot of just the visible viewport.
 */
async function captureViewport(page, outputPath) {
  await waitForPageStable(page, 5000);
  await dismissOverlays(page);

  await page.screenshot({
    path: outputPath,
    fullPage: false,
    type: 'png',
  });
}

/**
 * Capture a screenshot of a specific element by selector.
 */
async function captureElement(page, selector, outputPath) {
  try {
    const element = await page.waitForSelector(selector, { timeout: 5000 });
    if (element) {
      await element.screenshot({ path: outputPath, type: 'png' });
      return true;
    }
  } catch {
    // Element not found or not visible
  }
  return false;
}

/**
 * Capture screenshots of each visible section on the page.
 * Identifies major content sections (main, aside, sections, articles, cards, etc.)
 * and captures each one individually.
 *
 * Returns an array of { name, selector, path } for sections that were captured.
 */
async function captureSections(page, buildPathFn) {
  const sections = await page.evaluate(() => {
    const candidates = [];
    const selectors = [
      'main',
      'article',
      'section',
      'aside',
      '[role="main"]',
      '[role="complementary"]',
      '[role="region"]',
      '.card',
      '.panel',
      '.widget',
      '.content-section',
      '.page-section',
    ];

    const seen = new Set();

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el, i) => {
        // Skip tiny elements or those already covered
        const rect = el.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 50) return;

        const key = `${Math.round(rect.x)}-${Math.round(rect.y)}-${Math.round(rect.width)}-${Math.round(rect.height)}`;
        if (seen.has(key)) return;
        seen.add(key);

        const name =
          el.getAttribute('aria-label') ||
          el.getAttribute('data-section') ||
          el.id ||
          el.querySelector('h1, h2, h3, h4')?.textContent?.trim()?.substring(0, 60) ||
          `${sel.replace(/[^a-z]/g, '')}-${i}`;

        candidates.push({
          name,
          selector: el.id ? `#${el.id}` : `${sel}:nth-of-type(${i + 1})`,
          area: rect.width * rect.height,
        });
      });
    }

    // Sort by visual area (larger sections first), limit to top 20
    candidates.sort((a, b) => b.area - a.area);
    return candidates.slice(0, 20);
  });

  const captured = [];
  for (const section of sections) {
    const outputPath = buildPathFn(section.name);
    const ok = await captureElement(page, section.selector, outputPath);
    if (ok) {
      captured.push({ name: section.name, selector: section.selector, path: outputPath });
    }
  }

  return captured;
}

/**
 * Scroll the page fully to trigger any lazy-loaded content,
 * then scroll back to top before the screenshot.
 */
async function triggerLazyContent(page) {
  await page.evaluate(async () => {
    const scrollStep = Math.floor(window.innerHeight * 0.8);
    const maxScroll = document.body.scrollHeight;
    let scrollPos = 0;

    while (scrollPos < maxScroll) {
      window.scrollBy(0, scrollStep);
      scrollPos += scrollStep;
      await new Promise((r) => setTimeout(r, 300));
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
  });

  await delay(1000);
}

/**
 * Capture interactive states: click each tab, expand accordions,
 * and screenshot the resulting content.
 *
 * Returns an array of { name, type, path }.
 */
async function captureInteractiveStates(page, interactiveElements, buildPathFn) {
  const captured = [];

  // Capture tabs
  const tabs = interactiveElements.filter((e) => e.type === 'tab' && e.selector);
  for (const tab of tabs) {
    try {
      await page.click(tab.selector);
      await delay(800);
      await waitForPageStable(page, 5000);

      const name = `tab-${tab.text || tab.index}`;
      const outputPath = buildPathFn(name);
      await page.screenshot({ path: outputPath, fullPage: true, type: 'png' });
      captured.push({ name, type: 'tab', path: outputPath });
    } catch {
      // tab may no longer exist
    }
  }

  // Capture accordions (expand all first)
  const accordions = interactiveElements.filter((e) => e.type === 'accordion' && e.selector && !e.expanded);
  for (const acc of accordions) {
    try {
      await page.click(acc.selector);
      await delay(500);
    } catch {
      // skip
    }
  }

  if (accordions.length > 0) {
    await waitForPageStable(page, 5000);
    const name = 'all-accordions-expanded';
    const outputPath = buildPathFn(name);
    await page.screenshot({ path: outputPath, fullPage: true, type: 'png' });
    captured.push({ name, type: 'accordion', path: outputPath });
  }

  return captured;
}

/**
 * Try to dismiss common overlays, modals, and cookie banners.
 */
async function dismissOverlays(page) {
  const dismissSelectors = [
    // Cookie banners
    '[class*="cookie"] button[class*="accept"]',
    '[class*="cookie"] button[class*="close"]',
    '[class*="consent"] button[class*="accept"]',
    '[id*="cookie"] button',
    // Generic close buttons on modals
    '.modal .close',
    '.modal [aria-label="Close"]',
    '[class*="modal"] button[class*="close"]',
    '[class*="overlay"] button[class*="close"]',
    '[class*="banner"] button[class*="close"]',
    '[class*="dismiss"]',
  ];

  for (const sel of dismissSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        await delay(300);
      }
    } catch {
      // not present
    }
  }
}

module.exports = {
  captureFullPage,
  captureViewport,
  captureElement,
  captureSections,
  triggerLazyContent,
  captureInteractiveStates,
  dismissOverlays,
};

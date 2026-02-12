const { isSameOrigin, normalizeUrl, delay } = require('./utils');
const { waitForPageStable } = require('./browser');

/**
 * Discover all navigable links on the current page.
 * Returns an array of { url, text, context } objects.
 */
async function discoverLinks(page, baseUrl) {
  const links = await page.evaluate((base) => {
    const results = [];
    const seen = new Set();

    // Gather <a> tags
    document.querySelectorAll('a[href]').forEach((a) => {
      try {
        const href = new URL(a.href, base).href;
        if (!seen.has(href)) {
          seen.add(href);
          results.push({
            url: href,
            text: (a.textContent || '').trim().substring(0, 120),
            tagName: 'a',
            ariaLabel: a.getAttribute('aria-label') || '',
            parentNav: !!a.closest('nav, [role="navigation"], .sidebar, .nav, .menu'),
            parentId: a.closest('[id]')?.id || '',
          });
        }
      } catch { /* skip invalid URLs */ }
    });

    // Gather buttons and elements with click handlers that act as navigation
    // (common in SPAs with router links)
    document.querySelectorAll('[role="link"], [role="menuitem"], [data-href], [routerlink]').forEach((el) => {
      const href = el.getAttribute('data-href') || el.getAttribute('routerlink') || el.getAttribute('href');
      if (href) {
        try {
          const fullUrl = new URL(href, base).href;
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            results.push({
              url: fullUrl,
              text: (el.textContent || '').trim().substring(0, 120),
              tagName: el.tagName.toLowerCase(),
              ariaLabel: el.getAttribute('aria-label') || '',
              parentNav: !!el.closest('nav, [role="navigation"], .sidebar, .nav, .menu'),
              parentId: el.closest('[id]')?.id || '',
            });
          }
        } catch { /* skip */ }
      }
    });

    return results;
  }, baseUrl);

  return links;
}

/**
 * Discover interactive UI elements that might reveal more content
 * (tabs, accordions, dropdowns, modals).
 */
async function discoverInteractiveElements(page) {
  return page.evaluate(() => {
    const elements = [];

    // Tabs
    document.querySelectorAll('[role="tab"], .tab, [data-toggle="tab"], [data-bs-toggle="tab"]').forEach((el, i) => {
      elements.push({
        type: 'tab',
        index: i,
        text: (el.textContent || '').trim().substring(0, 80),
        selector: el.id ? `#${el.id}` : null,
        ariaSelected: el.getAttribute('aria-selected'),
      });
    });

    // Accordions
    document.querySelectorAll('[data-toggle="collapse"], [data-bs-toggle="collapse"], .accordion-button, details > summary').forEach((el, i) => {
      elements.push({
        type: 'accordion',
        index: i,
        text: (el.textContent || '').trim().substring(0, 80),
        selector: el.id ? `#${el.id}` : null,
        expanded: el.getAttribute('aria-expanded') === 'true',
      });
    });

    // Dropdowns / menus
    document.querySelectorAll('[data-toggle="dropdown"], [data-bs-toggle="dropdown"], [aria-haspopup="true"]').forEach((el, i) => {
      elements.push({
        type: 'dropdown',
        index: i,
        text: (el.textContent || '').trim().substring(0, 80),
        selector: el.id ? `#${el.id}` : null,
      });
    });

    return elements;
  });
}

/**
 * Click a tab and wait for content to settle, then return to let the
 * screenshotter capture it.
 */
async function activateTab(page, tabSelector) {
  try {
    if (tabSelector) {
      await page.click(tabSelector);
    }
    await delay(800);
    await waitForPageStable(page, 5000);
  } catch {
    // tab may have been removed or is not clickable
  }
}

/**
 * Expand an accordion section.
 */
async function expandAccordion(page, accordionSelector) {
  try {
    if (accordionSelector) {
      await page.click(accordionSelector);
    }
    await delay(600);
    await waitForPageStable(page, 5000);
  } catch {
    // skip if not expandable
  }
}

/**
 * Breadth-first crawl starting from the current page.
 *
 * Returns a Map<url, { url, text, context, depth, category, links }>.
 *
 * @param {import('playwright').Page} page
 * @param {string} baseUrl - Origin URL of the application
 * @param {object} options
 * @param {number} options.maxPages - Maximum pages to visit
 * @param {number} options.maxDepth - Maximum link depth from start page
 * @param {string[]} options.excludePatterns - URL substrings to exclude
 * @param {string[]} options.includePatterns - If set, only crawl URLs containing one of these
 */
async function crawlSite(page, baseUrl, options = {}) {
  const {
    maxPages = 100,
    maxDepth = 5,
    excludePatterns = ['logout', 'signout', 'sign-out', 'log-out', '/api/', '/auth/', '#'],
    includePatterns = [],
  } = options;

  const visited = new Map();
  const queue = []; // { url, depth, parentUrl }

  // Start from current page
  const startUrl = normalizeUrl(page.url(), baseUrl);
  queue.push({ url: startUrl, depth: 0, parentUrl: null });

  while (queue.length > 0 && visited.size < maxPages) {
    const { url, depth, parentUrl } = queue.shift();
    const normalized = normalizeUrl(url, baseUrl);

    if (visited.has(normalized)) continue;
    if (depth > maxDepth) continue;
    if (!isSameOrigin(normalized, baseUrl)) continue;

    // Check exclude patterns
    const lowerUrl = normalized.toLowerCase();
    if (excludePatterns.some((p) => lowerUrl.includes(p.toLowerCase()))) continue;

    // Check include patterns
    if (includePatterns.length > 0 && !includePatterns.some((p) => lowerUrl.includes(p.toLowerCase()))) continue;

    // Navigate
    try {
      await page.goto(normalized, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      } catch {
        // skip this page
        continue;
      }
    }

    await waitForPageStable(page);

    // Check if we got redirected to a login page (auth expired)
    const currentUrl = normalizeUrl(page.url(), baseUrl);
    if (currentUrl !== normalized && !isSameOrigin(currentUrl, baseUrl)) {
      console.log(`  ⚠ Redirected away from ${normalized} — possible auth issue, skipping.`);
      continue;
    }

    // Discover page info
    const links = await discoverLinks(page, baseUrl);
    const interactiveElements = await discoverInteractiveElements(page);
    const pageTitle = await page.title();

    visited.set(normalized, {
      url: normalized,
      title: pageTitle,
      depth,
      parentUrl,
      links,
      interactiveElements,
    });

    // Enqueue discovered links
    for (const link of links) {
      const linkNorm = normalizeUrl(link.url, baseUrl);
      if (!visited.has(linkNorm) && isSameOrigin(linkNorm, baseUrl)) {
        queue.push({ url: linkNorm, depth: depth + 1, parentUrl: normalized });
      }
    }
  }

  return visited;
}

module.exports = {
  discoverLinks,
  discoverInteractiveElements,
  activateTab,
  expandAccordion,
  crawlSite,
};

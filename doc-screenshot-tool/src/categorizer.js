/**
 * Intelligent page categorizer.
 *
 * Analyzes the URL path, page title, navigation context, and DOM structure
 * to assign each page to a documentation-friendly category.
 */

/**
 * Built-in category rules. Each rule has a test function and a category name.
 * The first matching rule wins.
 */
const CATEGORY_RULES = [
  // Authentication / Login
  {
    test: (info) => /\b(login|signin|sign-in|auth|sso|oauth)\b/i.test(info.url + ' ' + info.title),
    category: 'authentication',
  },
  // Dashboard / Home
  {
    test: (info) =>
      info.depth === 0 ||
      /\b(dashboard|home|overview|main)\b/i.test(info.url + ' ' + info.title),
    category: 'dashboard',
  },
  // Settings / Configuration
  {
    test: (info) => /\b(settings|config|configuration|preferences|options|account)\b/i.test(info.url + ' ' + info.title),
    category: 'settings',
  },
  // User / Profile management
  {
    test: (info) => /\b(user|users|profile|members|team|roles|permissions|iam)\b/i.test(info.url + ' ' + info.title),
    category: 'user-management',
  },
  // Reports / Analytics
  {
    test: (info) => /\b(report|reports|analytics|metrics|statistics|insights|chart)\b/i.test(info.url + ' ' + info.title),
    category: 'reports-analytics',
  },
  // Forms / Input
  {
    test: (info) => /\b(create|new|add|edit|form|wizard|setup)\b/i.test(info.url),
    category: 'forms',
  },
  // Lists / Tables
  {
    test: (info) => /\b(list|table|index|browse|search|filter)\b/i.test(info.url + ' ' + info.title),
    category: 'lists',
  },
  // Detail / View pages
  {
    test: (info) => /\b(detail|view|show|info)\b/i.test(info.url),
    category: 'detail-views',
  },
  // Help / Documentation
  {
    test: (info) => /\b(help|docs|documentation|faq|support|guide|tutorial)\b/i.test(info.url + ' ' + info.title),
    category: 'help',
  },
  // Notifications / Alerts
  {
    test: (info) => /\b(notification|alert|message|inbox|mail)\b/i.test(info.url + ' ' + info.title),
    category: 'notifications',
  },
  // Integration / API
  {
    test: (info) => /\b(integration|api|webhook|connector|plugin)\b/i.test(info.url + ' ' + info.title),
    category: 'integrations',
  },
  // Billing / Subscription
  {
    test: (info) => /\b(billing|subscription|plan|pricing|payment|invoice)\b/i.test(info.url + ' ' + info.title),
    category: 'billing',
  },
];

/**
 * Categorize a single page based on its metadata.
 *
 * @param {object} pageInfo - { url, title, depth, links, interactiveElements }
 * @param {object[]} customRules - Additional category rules to prepend
 * @returns {string} category name
 */
function categorizePage(pageInfo, customRules = []) {
  const allRules = [...customRules, ...CATEGORY_RULES];

  for (const rule of allRules) {
    if (rule.test(pageInfo)) {
      return rule.category;
    }
  }

  // Fallback: derive from the first meaningful URL path segment
  try {
    const pathname = new URL(pageInfo.url).pathname.replace(/^\/+/, '');
    const firstSegment = pathname.split('/')[0];
    if (firstSegment) {
      return firstSegment.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
  } catch {
    // ignore
  }

  return 'general';
}

/**
 * Categorize all crawled pages and return a Map<category, pageInfo[]>.
 */
function categorizeAll(pagesMap, customRules = []) {
  const categorized = new Map();

  for (const [url, pageInfo] of pagesMap) {
    const category = categorizePage(pageInfo, customRules);
    pageInfo.category = category;

    if (!categorized.has(category)) {
      categorized.set(category, []);
    }
    categorized.get(category).push(pageInfo);
  }

  return categorized;
}

/**
 * Detect the page "type" based on DOM analysis.
 * Useful for adding extra context to the manifest.
 */
async function detectPageType(page) {
  return page.evaluate(() => {
    const indicators = {
      hasTable: !!document.querySelector('table, [role="grid"], [class*="table"]'),
      hasForm: !!document.querySelector('form, [role="form"]'),
      hasCards: document.querySelectorAll('[class*="card"], [class*="Card"]').length > 2,
      hasTabs: !!document.querySelector('[role="tablist"], [class*="tab"]'),
      hasChart: !!document.querySelector('canvas, svg[class*="chart"], [class*="chart"], [class*="graph"]'),
      hasSidebar: !!document.querySelector('aside, [class*="sidebar"], [class*="side-nav"]'),
      hasModal: !!document.querySelector('[role="dialog"], [class*="modal"]'),
      hasTree: !!document.querySelector('[role="tree"], [role="treeitem"]'),
      hasList: document.querySelectorAll('ul li, ol li, [role="listitem"]').length > 5,
      hasWizard: !!document.querySelector('[class*="wizard"], [class*="stepper"], [class*="step"]'),
    };

    const types = [];
    if (indicators.hasTable) types.push('table-view');
    if (indicators.hasForm) types.push('form');
    if (indicators.hasCards) types.push('card-layout');
    if (indicators.hasTabs) types.push('tabbed-view');
    if (indicators.hasChart) types.push('chart-dashboard');
    if (indicators.hasWizard) types.push('wizard');
    if (indicators.hasList) types.push('list-view');
    if (types.length === 0) types.push('content-page');

    return { indicators, types };
  });
}

module.exports = {
  categorizePage,
  categorizeAll,
  detectPageType,
  CATEGORY_RULES,
};

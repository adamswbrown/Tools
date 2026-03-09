import * as fs from 'fs';
import * as path from 'path';
import { chromium, Page, Cookie } from 'playwright';
import { analyzePage, formatPageAnalysis, PageAnalysis } from './page-analyzer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');

function ensureDirs() {
  for (const dir of [DATA_DIR, PROFILES_DIR, TEMPLATES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Site Profiles ---

export interface SiteProfile {
  id: string;
  name: string;
  createdAt: string;
  urls: string[];
  pages: PageSnapshot[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  analysisText: string;
  elementCount: number;
}

function profilePath(id: string): string {
  return path.join(PROFILES_DIR, `${id}.json`);
}

/**
 * Scans one or more URLs, extracts page analysis for each,
 * and saves as a reusable site profile.
 */
export async function scanSite(
  urls: string[],
  name: string,
  onProgress?: (msg: string) => void,
  cookies?: Cookie[]
): Promise<SiteProfile> {
  ensureDirs();
  const log = onProgress || (() => {});

  log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  if (cookies && cookies.length > 0) {
    await context.addCookies(cookies);
    log(`Injected ${cookies.length} auth cookies.`);
  }

  const pages: PageSnapshot[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    log(`Scanning page ${i + 1}/${urls.length}: ${url}`);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle').catch(() => {});

      const analysis = await analyzePage(page);
      const analysisText = formatPageAnalysis(analysis);

      pages.push({
        url: analysis.url,
        title: analysis.title,
        analysisText,
        elementCount: analysis.elements.length,
      });

      log(`Found ${analysis.elements.length} elements on "${analysis.title}"`);
    } catch (err) {
      log(`Failed to scan ${url}: ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `profile-${Date.now()}`;

  const profile: SiteProfile = {
    id,
    name,
    createdAt: new Date().toISOString(),
    urls,
    pages,
  };

  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  log(`Profile "${name}" saved with ${pages.length} page(s).`);

  return profile;
}

/**
 * Crawls a site starting from a URL, discovering and scanning all linked
 * pages that match the given path prefix. Builds a complete site profile
 * automatically without needing to list every URL manually.
 */
export async function crawlSite(
  startUrl: string,
  name: string,
  options: {
    pathFilter?: string;
    maxPages?: number;
    cookies?: Cookie[];
  } = {},
  onProgress?: (msg: string) => void
): Promise<SiteProfile> {
  ensureDirs();
  const log = onProgress || (() => {});
  const maxPages = options.maxPages || 50;

  const startParsed = new URL(startUrl);
  const origin = startParsed.origin;

  // Path filter: only crawl URLs under this path prefix
  // Default: use the starting URL's path as the scope
  const pathFilter = options.pathFilter
    || startParsed.pathname.replace(/\/[^/]*$/, '/') // parent directory of start URL
    || '/';

  log(`Crawling ${origin} under path "${pathFilter}" (max ${maxPages} pages)...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  if (options.cookies && options.cookies.length > 0) {
    await context.addCookies(options.cookies);
    log(`Injected ${options.cookies.length} auth cookies.`);
  }

  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const pages: PageSnapshot[] = [];
  const allDiscoveredUrls: string[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;

    // Normalise URL for dedup (strip trailing slash, hash, query for comparison)
    const normalized = normalizeUrl(url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    log(`[${pages.length + 1}/${maxPages}] Scanning: ${url}`);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle').catch(() => {});

      // Analyze page elements
      const analysis = await analyzePage(page);
      const analysisText = formatPageAnalysis(analysis);

      pages.push({
        url: analysis.url,
        title: analysis.title,
        analysisText,
        elementCount: analysis.elements.length,
      });

      log(`  Found ${analysis.elements.length} elements on "${analysis.title}"`);

      // Discover new links on this page
      const links = await discoverLinks(page, origin, pathFilter);
      let newCount = 0;
      for (const link of links) {
        const norm = normalizeUrl(link);
        if (!visited.has(norm) && !queue.some(q => normalizeUrl(q) === norm)) {
          queue.push(link);
          allDiscoveredUrls.push(link);
          newCount++;
        }
      }
      if (newCount > 0) {
        log(`  Discovered ${newCount} new link(s) to crawl`);
      }
    } catch (err) {
      log(`  Failed to scan ${url}: ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  if (queue.length > 0) {
    log(`Reached max page limit (${maxPages}). ${queue.length} URLs not scanned.`);
  }

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `profile-${Date.now()}`;

  const profile: SiteProfile = {
    id,
    name,
    createdAt: new Date().toISOString(),
    urls: pages.map(p => p.url),
    pages,
  };

  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  log(`Profile "${name}" saved with ${pages.length} page(s).`);

  return profile;
}

/**
 * Discovers all same-origin links on a page that match the path filter.
 * Excludes anchors, asset files, and non-navigable URLs.
 */
async function discoverLinks(page: Page, origin: string, pathFilter: string): Promise<string[]> {
  const hrefs: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).href)
      .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('mailto:'));
  });

  const skipExtensions = /\.(pdf|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|zip|mp4|mp3|ico)$/i;

  const filtered: string[] = [];
  for (const href of hrefs) {
    try {
      const parsed = new URL(href);
      // Must be same origin
      if (parsed.origin !== origin) continue;
      // Must be under the path filter
      if (!parsed.pathname.startsWith(pathFilter)) continue;
      // Skip asset files
      if (skipExtensions.test(parsed.pathname)) continue;
      // Strip hash and build clean URL
      parsed.hash = '';
      filtered.push(parsed.toString());
    } catch {
      // Invalid URL, skip
    }
  }

  return filtered;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    // Remove trailing slash for consistency (except root)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return parsed.origin + pathname + parsed.search;
  } catch {
    return url;
  }
}

export function listProfiles(): Array<{ id: string; name: string; createdAt: string; pageCount: number }> {
  ensureDirs();
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf-8')) as SiteProfile;
    return { id: data.id, name: data.name, createdAt: data.createdAt, pageCount: data.pages.length };
  });
}

export function loadProfile(id: string): SiteProfile | null {
  const p = profilePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as SiteProfile;
}

export function deleteProfile(id: string): boolean {
  const p = profilePath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

/**
 * Builds combined page context text from a profile,
 * merging analysis from all scanned pages.
 */
export function profileToContext(profile: SiteProfile): string {
  if (profile.pages.length === 1) {
    return profile.pages[0].analysisText;
  }
  return profile.pages
    .map((p, i) => `--- Page ${i + 1}: ${p.url} ---\n${p.analysisText}`)
    .join('\n\n');
}

// --- Prompt Templates ---

export interface PromptTemplate {
  id: string;
  name: string;
  createdAt: string;
  context: string;
}

function templatePath(id: string): string {
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

export function saveTemplate(name: string, context: string): PromptTemplate {
  ensureDirs();
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `template-${Date.now()}`;

  const template: PromptTemplate = {
    id,
    name,
    createdAt: new Date().toISOString(),
    context,
  };

  fs.writeFileSync(templatePath(id), JSON.stringify(template, null, 2));
  return template;
}

export function listTemplates(): Array<{ id: string; name: string; createdAt: string }> {
  ensureDirs();
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8')) as PromptTemplate;
    return { id: data.id, name: data.name, createdAt: data.createdAt };
  });
}

export function loadTemplate(id: string): PromptTemplate | null {
  const p = templatePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as PromptTemplate;
}

export function deleteTemplate(id: string): boolean {
  const p = templatePath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

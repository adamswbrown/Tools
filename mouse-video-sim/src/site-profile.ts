import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
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
  onProgress?: (msg: string) => void
): Promise<SiteProfile> {
  ensureDirs();
  const log = onProgress || (() => {});

  log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

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

import * as fs from 'fs';
import * as path from 'path';
import { chromium, Cookie } from 'playwright';

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_DIR = path.join(DATA_DIR, 'auth');

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export interface SavedAuth {
  id: string;
  name: string;
  createdAt: string;
  method: 'interactive' | 'credentials' | 'cookies';
  domain: string;
  cookies: Cookie[];
}

export interface SavedCredentials {
  id: string;
  name: string;
  domain: string;
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
}

function authPath(id: string): string {
  return path.join(AUTH_DIR, `${id}.json`);
}

function credentialsPath(id: string): string {
  return path.join(AUTH_DIR, `cred-${id}.json`);
}

// --- Interactive Login ---

/**
 * Opens a visible browser window at the given URL and waits for the user
 * to log in. Once they signal they're done (via callback), captures the
 * session cookies and returns them.
 */
export async function interactiveLogin(
  loginUrl: string,
  name: string,
  onProgress?: (msg: string) => void
): Promise<SavedAuth> {
  ensureAuthDir();
  const log = onProgress || (() => {});

  log('Opening browser for login — please log in manually...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the user to navigate away from the login page
  // (indicating they've successfully logged in)
  log('Waiting for login to complete — the browser will close automatically when a navigation is detected...');

  const startUrl = new URL(loginUrl);

  // Poll for URL change or new cookies appearing
  await new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      try {
        const currentUrl = page.url();
        const cookies = await context.cookies();
        const sessionCookies = cookies.filter(c =>
          c.name.toLowerCase().includes('session') ||
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('auth') ||
          c.name.toLowerCase().includes('jwt') ||
          c.name.toLowerCase().includes('sid') ||
          c.httpOnly
        );

        // Detected login: URL changed from login page, or auth cookies appeared
        const urlChanged = new URL(currentUrl).pathname !== startUrl.pathname;
        if (urlChanged && sessionCookies.length > 0) {
          clearInterval(interval);
          resolve();
        }
      } catch {
        // Page might be navigating
      }
    }, 1000);

    // Also resolve after 5 minutes max
    setTimeout(() => { clearInterval(interval); resolve(); }, 300000);
  });

  log('Login detected — capturing session cookies...');

  const cookies = await context.cookies();
  const domain = new URL(loginUrl).hostname;

  await browser.close();

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `auth-${Date.now()}`;

  const auth: SavedAuth = {
    id,
    name,
    createdAt: new Date().toISOString(),
    method: 'interactive',
    domain,
    cookies,
  };

  fs.writeFileSync(authPath(id), JSON.stringify(auth, null, 2));
  log(`Session "${name}" saved with ${cookies.length} cookies.`);

  return auth;
}

// --- Credential-Based Login ---

/**
 * Saves login credentials for automated login before crawl/record.
 */
export function saveCredentials(creds: Omit<SavedCredentials, 'id'>): SavedCredentials {
  ensureAuthDir();
  const id = creds.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `cred-${Date.now()}`;

  const saved: SavedCredentials = { id, ...creds };
  fs.writeFileSync(credentialsPath(id), JSON.stringify(saved, null, 2));
  return saved;
}

/**
 * Performs automated login using stored credentials and returns cookies.
 */
export async function loginWithCredentials(
  credsId: string,
  onProgress?: (msg: string) => void
): Promise<SavedAuth> {
  ensureAuthDir();
  const log = onProgress || (() => {});

  const credsPath = credentialsPath(credsId);
  if (!fs.existsSync(credsPath)) throw new Error(`Credentials "${credsId}" not found`);
  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8')) as SavedCredentials;

  log(`Logging in to ${creds.loginUrl}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto(creds.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  // Fill credentials
  log('Entering credentials...');
  await page.fill(creds.usernameSelector, creds.username);
  await page.fill(creds.passwordSelector, creds.password);

  // Submit
  log('Submitting login form...');
  await page.click(creds.submitSelector);

  // Wait for navigation
  await page.waitForLoadState('networkidle').catch(() => {});
  await new Promise(r => setTimeout(r, 2000)); // Extra wait for redirects

  const cookies = await context.cookies();
  const domain = new URL(creds.loginUrl).hostname;

  await browser.close();

  const id = creds.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `auth-${Date.now()}`;

  const auth: SavedAuth = {
    id,
    name: creds.name,
    createdAt: new Date().toISOString(),
    method: 'credentials',
    domain,
    cookies,
  };

  fs.writeFileSync(authPath(id), JSON.stringify(auth, null, 2));
  log(`Session "${creds.name}" saved with ${cookies.length} cookies.`);

  return auth;
}

// --- Cookie Import ---

/**
 * Saves imported cookies (from browser devtools export or extension).
 */
export function importCookies(
  name: string,
  domain: string,
  cookies: Cookie[]
): SavedAuth {
  ensureAuthDir();

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `auth-${Date.now()}`;

  const auth: SavedAuth = {
    id,
    name,
    createdAt: new Date().toISOString(),
    method: 'cookies',
    domain,
    cookies,
  };

  fs.writeFileSync(authPath(id), JSON.stringify(auth, null, 2));
  return auth;
}

// --- Shared ---

export function listSessions(): Array<{ id: string; name: string; domain: string; method: string; createdAt: string }> {
  ensureAuthDir();
  const files = fs.readdirSync(AUTH_DIR).filter(f => f.endsWith('.json') && !f.startsWith('cred-'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, f), 'utf-8')) as SavedAuth;
    return { id: data.id, name: data.name, domain: data.domain, method: data.method, createdAt: data.createdAt };
  });
}

export function listCredentials(): Array<{ id: string; name: string; domain: string; loginUrl: string }> {
  ensureAuthDir();
  const files = fs.readdirSync(AUTH_DIR).filter(f => f.startsWith('cred-') && f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, f), 'utf-8')) as SavedCredentials;
    return { id: data.id, name: data.name, domain: data.domain, loginUrl: data.loginUrl };
  });
}

export function loadSession(id: string): SavedAuth | null {
  const p = authPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as SavedAuth;
}

export function deleteSession(id: string): boolean {
  const p = authPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

export function deleteCredentials(id: string): boolean {
  const p = credentialsPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

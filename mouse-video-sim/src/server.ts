import express from 'express';
import path from 'path';
import fs from 'fs';
import { Simulator } from './simulator';
import {
  scanSite,
  crawlSite,
  listProfiles,
  loadProfile,
  deleteProfile,
  profileToContext,
  saveTemplate,
  listTemplates,
  loadTemplate,
  deleteTemplate,
} from './site-profile';
import {
  interactiveLogin,
  loginWithCredentials,
  importCookies,
  saveCredentials,
  listSessions,
  listCredentials,
  loadSession,
  deleteSession,
  deleteCredentials,
} from './auth';
import type { Cookie } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve output files for download
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

// --- Auth Endpoints ---

app.post('/api/auth/interactive', async (req, res) => {
  const { loginUrl, name } = req.body;
  if (!loginUrl || !name) { res.status(400).json({ error: 'Missing: loginUrl, name' }); return; }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const auth = await interactiveLogin(loginUrl, name, (msg) => {
      try { res.write(JSON.stringify({ type: 'progress', message: msg }) + '\n'); } catch {}
    });
    res.write(JSON.stringify({ type: 'done', session: { id: auth.id, name: auth.name, domain: auth.domain, cookieCount: auth.cookies.length } }) + '\n');
    res.end();
  } catch (error) {
    res.write(JSON.stringify({ type: 'error', message: (error as Error).message }) + '\n');
    res.end();
  }
});

app.post('/api/auth/credentials', (req, res) => {
  const { name, domain, loginUrl, username, password, usernameSelector, passwordSelector, submitSelector } = req.body;
  if (!name || !loginUrl || !username || !password) {
    res.status(400).json({ error: 'Missing required credential fields' }); return;
  }
  const creds = saveCredentials({
    name, domain: domain || new URL(loginUrl).hostname, loginUrl, username, password,
    usernameSelector: usernameSelector || 'input[type="email"], input[name="email"], input[name="username"]',
    passwordSelector: passwordSelector || 'input[type="password"]',
    submitSelector: submitSelector || 'button[type="submit"]',
  });
  res.json(creds);
});

app.post('/api/auth/credentials/:id/login', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const auth = await loginWithCredentials(req.params.id, (msg) => {
      try { res.write(JSON.stringify({ type: 'progress', message: msg }) + '\n'); } catch {}
    });
    res.write(JSON.stringify({ type: 'done', session: { id: auth.id, name: auth.name, domain: auth.domain, cookieCount: auth.cookies.length } }) + '\n');
    res.end();
  } catch (error) {
    res.write(JSON.stringify({ type: 'error', message: (error as Error).message }) + '\n');
    res.end();
  }
});

app.post('/api/auth/cookies', (req, res) => {
  const { name, domain, cookies } = req.body;
  if (!name || !domain || !cookies) { res.status(400).json({ error: 'Missing: name, domain, cookies' }); return; }
  const auth = importCookies(name, domain, cookies as Cookie[]);
  res.json({ id: auth.id, name: auth.name, domain: auth.domain, cookieCount: auth.cookies.length });
});

app.get('/api/auth/sessions', (_req, res) => {
  res.json(listSessions());
});

app.get('/api/auth/credentials', (_req, res) => {
  res.json(listCredentials());
});

app.delete('/api/auth/sessions/:id', (req, res) => {
  res.json({ deleted: deleteSession(req.params.id) });
});

app.delete('/api/auth/credentials/:id', (req, res) => {
  res.json({ deleted: deleteCredentials(req.params.id) });
});

// --- Site Profile Endpoints ---

app.post('/api/scan', async (req, res) => {
  const { urls, name, authSessionId } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0 || !name) {
    res.status(400).json({ error: 'Missing required fields: urls (array), name' });
    return;
  }

  // Load auth cookies if provided
  const cookies = authSessionId ? loadSession(authSessionId)?.cookies : undefined;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const profile = await scanSite(urls, name, (msg) => {
      try { res.write(JSON.stringify({ type: 'progress', message: msg }) + '\n'); } catch {}
    }, cookies);

    res.write(JSON.stringify({ type: 'done', profile: { id: profile.id, name: profile.name, pageCount: profile.pages.length } }) + '\n');
    res.end();
  } catch (error) {
    res.write(JSON.stringify({ type: 'error', message: (error as Error).message }) + '\n');
    res.end();
  }
});

app.post('/api/crawl', async (req, res) => {
  const { startUrl, name, pathFilter, maxPages, authSessionId } = req.body;

  if (!startUrl || !name) {
    res.status(400).json({ error: 'Missing required fields: startUrl, name' });
    return;
  }

  const cookies = authSessionId ? loadSession(authSessionId)?.cookies : undefined;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const profile = await crawlSite(startUrl, name, { pathFilter, maxPages: maxPages || 50, cookies }, (msg) => {
      try { res.write(JSON.stringify({ type: 'progress', message: msg }) + '\n'); } catch {}
    });

    res.write(JSON.stringify({ type: 'done', profile: { id: profile.id, name: profile.name, pageCount: profile.pages.length } }) + '\n');
    res.end();
  } catch (error) {
    res.write(JSON.stringify({ type: 'error', message: (error as Error).message }) + '\n');
    res.end();
  }
});

app.get('/api/profiles', (_req, res) => {
  res.json(listProfiles());
});

app.get('/api/profiles/:id', (req, res) => {
  const profile = loadProfile(req.params.id);
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(profile);
});

app.delete('/api/profiles/:id', (req, res) => {
  const deleted = deleteProfile(req.params.id);
  res.json({ deleted });
});

// --- Prompt Template Endpoints ---

app.post('/api/templates', (req, res) => {
  const { name, context } = req.body;
  if (!name || !context) { res.status(400).json({ error: 'Missing required fields: name, context' }); return; }
  const template = saveTemplate(name, context);
  res.json(template);
});

app.get('/api/templates', (_req, res) => {
  res.json(listTemplates());
});

app.get('/api/templates/:id', (req, res) => {
  const template = loadTemplate(req.params.id);
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json(template);
});

app.delete('/api/templates/:id', (req, res) => {
  const deleted = deleteTemplate(req.params.id);
  res.json({ deleted });
});

// --- Simulation Endpoint ---

app.post('/api/simulate', async (req, res) => {
  const { url, instructions, pageContext, width, height, mouseConfig, profileId, authSessionId } = req.body;

  if (!url || !instructions) {
    res.status(400).json({ error: 'Missing required fields: url, instructions' });
    return;
  }

  const cookies = authSessionId ? loadSession(authSessionId)?.cookies : undefined;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  const sendProgress = (data: Record<string, unknown>) => {
    try {
      res.write(JSON.stringify(data) + '\n');
    } catch {}
  };

  try {
    let fullContext = '';

    if (profileId) {
      const profile = loadProfile(profileId);
      if (profile) {
        fullContext += profileToContext(profile);
        sendProgress({ type: 'progress', status: 'parsing', message: `Using saved profile: "${profile.name}"` });
      }
    }

    if (pageContext) {
      fullContext += (fullContext ? '\n\n' : '') + pageContext;
    }

    const simulator = new Simulator((progress) => {
      sendProgress({ type: 'progress', ...progress });
    }, mouseConfig);

    const fullInstructions = fullContext
      ? `Context about this UI:\n${fullContext}\n\nSteps to perform:\n${instructions}`
      : instructions;

    const videoPath = await simulator.run(
      url,
      fullInstructions,
      width || 1280,
      height || 720,
      !!profileId,
      cookies
    );

    const relativePath = path.relative(
      path.join(__dirname, '..', 'output'),
      videoPath
    );

    let downloadUrl: string;
    if (fs.existsSync(videoPath)) {
      downloadUrl = `/output/${relativePath}`;
    } else {
      const webmPath = videoPath.replace('.mp4', '.webm');
      const webmRelative = path.relative(
        path.join(__dirname, '..', 'output'),
        webmPath
      );
      downloadUrl = `/output/${webmRelative}`;
    }

    sendProgress({
      type: 'done',
      downloadUrl,
      message: 'Video ready for download!',
    });

    res.end();
  } catch (error) {
    sendProgress({
      type: 'error',
      message: (error as Error).message,
    });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Mouse Video Simulator running at http://localhost:${PORT}`);
});

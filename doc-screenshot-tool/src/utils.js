const path = require('path');
const fs = require('fs');

/**
 * Sanitize a string for use as a directory or file name.
 */
function sanitizeName(str) {
  return str
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

/**
 * Convert a URL path into a nested directory-friendly path.
 * e.g. /settings/users/roles -> settings/users/roles
 */
function urlToDirectoryPath(urlString, baseUrl) {
  try {
    const url = new URL(urlString, baseUrl);
    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) return '_root';

    const segments = pathname.split('/').map(s => sanitizeName(s) || '_');
    return segments.join(path.sep);
  } catch {
    return sanitizeName(urlString);
  }
}

/**
 * Build the output path for a screenshot.
 * Structure: <outputDir>/<category>/<url-path>/screenshot.png
 */
function buildScreenshotPath(outputDir, category, urlString, baseUrl, suffix = '') {
  const dirPath = urlToDirectoryPath(urlString, baseUrl);
  const categoryDir = sanitizeName(category || 'uncategorized');
  const dir = path.join(outputDir, categoryDir, dirPath);
  fs.mkdirSync(dir, { recursive: true });

  const filename = suffix ? `screenshot-${suffix}.png` : 'screenshot.png';
  return path.join(dir, filename);
}

/**
 * Build path for a section-level screenshot within a page.
 */
function buildSectionScreenshotPath(outputDir, category, urlString, baseUrl, sectionName) {
  const dirPath = urlToDirectoryPath(urlString, baseUrl);
  const categoryDir = sanitizeName(category || 'uncategorized');
  const dir = path.join(outputDir, categoryDir, dirPath, 'sections');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${sanitizeName(sectionName)}.png`;
  return path.join(dir, filename);
}

/**
 * Write the manifest JSON summarizing all captured screenshots.
 */
function writeManifest(outputDir, manifest) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

/**
 * Delay helper.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a URL is same-origin relative to the base.
 */
function isSameOrigin(url, baseUrl) {
  try {
    const a = new URL(url, baseUrl);
    const b = new URL(baseUrl);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

/**
 * Normalize a URL by removing hash fragments and trailing slashes.
 */
function normalizeUrl(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = '';
    let normalized = parsed.href.replace(/\/+$/, '');
    return normalized;
  } catch {
    return url;
  }
}

module.exports = {
  sanitizeName,
  urlToDirectoryPath,
  buildScreenshotPath,
  buildSectionScreenshotPath,
  writeManifest,
  delay,
  isSameOrigin,
  normalizeUrl,
};

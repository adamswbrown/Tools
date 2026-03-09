import { Page } from 'playwright';

export interface PageElement {
  tag: string;
  type?: string;
  text: string;
  selector: string;
  ariaLabel?: string;
  placeholder?: string;
  role?: string;
  href?: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface PageAnalysis {
  title: string;
  url: string;
  elements: PageElement[];
  screenshotBase64: string;
}

/**
 * Analyzes a live page to extract all interactive elements and take a screenshot.
 * This gives the LLM full context about what's actually on the page before
 * it generates actions from the user's plain English instructions.
 */
export async function analyzePage(page: Page): Promise<PageAnalysis> {
  const title = await page.title();
  const url = page.url();

  // Take a screenshot for vision context
  const screenshot = await page.screenshot({ type: 'png' });
  const screenshotBase64 = screenshot.toString('base64');

  // Extract all interactive elements from the DOM
  const elements: PageElement[] = await page.evaluate(() => {
    const interactiveSelectors = [
      'a[href]',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="combobox"]',
      '[onclick]',
      '[tabindex]',
      'summary',
      'details',
      'label[for]',
    ];

    const seen = new Set<Element>();
    const results: Array<{
      tag: string;
      type?: string;
      text: string;
      selector: string;
      ariaLabel?: string;
      placeholder?: string;
      role?: string;
      href?: string;
      bounds: { x: number; y: number; width: number; height: number };
    }> = [];

    for (const sel of interactiveSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        // Skip invisible or off-screen elements
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        if (rect.right < 0 || rect.left > window.innerWidth) continue;

        const htmlEl = el as HTMLElement;

        // Build the best possible CSS selector
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.getAttribute('data-testid')) {
          selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
        } else if (el.getAttribute('name')) {
          selector = `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
        } else if (el.getAttribute('aria-label')) {
          selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
        } else {
          // Fallback: use tag + text content
          const tag = el.tagName.toLowerCase();
          const text = (htmlEl.innerText || '').trim().substring(0, 40);
          if (text) {
            selector = `${tag}:has-text("${text}")`;
          } else {
            // Use nth-of-type as last resort
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
              const index = siblings.indexOf(el);
              selector = `${tag}:nth-of-type(${index + 1})`;
            } else {
              selector = tag;
            }
          }
        }

        results.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || undefined,
          text: (htmlEl.innerText || htmlEl.textContent || '').trim().substring(0, 80),
          selector,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          role: el.getAttribute('role') || undefined,
          href: el.getAttribute('href') || undefined,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    }

    // Also extract visible headings and prominent text for context
    const headings = document.querySelectorAll('h1, h2, h3, nav, [role="navigation"]');
    for (const el of headings) {
      if (seen.has(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const htmlEl = el as HTMLElement;
      results.push({
        tag: el.tagName.toLowerCase(),
        text: (htmlEl.innerText || '').trim().substring(0, 120),
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
        role: el.getAttribute('role') || undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return results;
  });

  return { title, url, elements, screenshotBase64 };
}

/**
 * Formats the page analysis into a structured text summary
 * suitable for including in an LLM prompt.
 */
export function formatPageAnalysis(analysis: PageAnalysis): string {
  const lines: string[] = [
    `## Page: "${analysis.title}"`,
    `URL: ${analysis.url}`,
    '',
    '## Interactive Elements on Page:',
    '',
  ];

  // Group by type for clarity
  const buttons = analysis.elements.filter(
    (e) => e.tag === 'button' || e.role === 'button'
  );
  const links = analysis.elements.filter(
    (e) => e.tag === 'a' && e.href
  );
  const inputs = analysis.elements.filter(
    (e) => e.tag === 'input' || e.tag === 'textarea' || e.tag === 'select'
  );
  const other = analysis.elements.filter(
    (e) =>
      !buttons.includes(e) &&
      !links.includes(e) &&
      !inputs.includes(e)
  );

  if (buttons.length) {
    lines.push('### Buttons:');
    for (const el of buttons) {
      const label = el.ariaLabel || el.text || '(no label)';
      lines.push(`- "${label}" → selector: \`${el.selector}\` at (${el.bounds.x}, ${el.bounds.y})`);
    }
    lines.push('');
  }

  if (inputs.length) {
    lines.push('### Input Fields:');
    for (const el of inputs) {
      const label =
        el.ariaLabel || el.placeholder || el.text || `${el.tag}[type=${el.type || 'text'}]`;
      lines.push(`- "${label}" → selector: \`${el.selector}\` at (${el.bounds.x}, ${el.bounds.y})`);
    }
    lines.push('');
  }

  if (links.length) {
    lines.push('### Links:');
    for (const el of links.slice(0, 30)) { // Cap at 30 to avoid huge prompts
      const label = el.ariaLabel || el.text || el.href || '(no label)';
      lines.push(`- "${label}" → selector: \`${el.selector}\``);
    }
    if (links.length > 30) {
      lines.push(`  ... and ${links.length - 30} more links`);
    }
    lines.push('');
  }

  if (other.length) {
    lines.push('### Other Interactive/Structural Elements:');
    for (const el of other.slice(0, 20)) {
      const label = el.ariaLabel || el.text || el.tag;
      lines.push(`- [${el.tag}] "${label}" → selector: \`${el.selector}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

import { Page } from 'playwright';
import { identifyElementByVision } from './instruction-parser';

interface FoundElement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tries to find an element by CSS selector first, then falls back
 * to vision-based identification using Claude.
 */
export async function findElement(
  page: Page,
  selector: string | undefined,
  description: string | undefined
): Promise<FoundElement> {
  // Strategy 1: Try CSS selector
  if (selector) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 3000 });
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            width: box.width,
            height: box.height,
          };
        }
      }
    } catch {
      // Selector not found, try alternatives
    }
  }

  // Strategy 2: Try common selector patterns based on description
  if (description) {
    const altSelectors = generateAlternativeSelectors(description);
    for (const alt of altSelectors) {
      try {
        const element = await page.waitForSelector(alt, { timeout: 1000 });
        if (element) {
          const box = await element.boundingBox();
          if (box) {
            return {
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              width: box.width,
              height: box.height,
            };
          }
        }
      } catch {
        continue;
      }
    }

    // Strategy 3: Try Playwright text/role locators
    try {
      const byText = page.getByText(description, { exact: false });
      const count = await byText.count();
      if (count > 0) {
        const box = await byText.first().boundingBox();
        if (box) {
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            width: box.width,
            height: box.height,
          };
        }
      }
    } catch {
      // Text locator failed
    }

    try {
      const byRole = page.getByRole('button', { name: description });
      const count = await byRole.count();
      if (count > 0) {
        const box = await byRole.first().boundingBox();
        if (box) {
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            width: box.width,
            height: box.height,
          };
        }
      }
    } catch {
      // Role locator failed
    }

    try {
      const byLink = page.getByRole('link', { name: description });
      const count = await byLink.count();
      if (count > 0) {
        const box = await byLink.first().boundingBox();
        if (box) {
          return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            width: box.width,
            height: box.height,
          };
        }
      }
    } catch {
      // Link locator failed
    }
  }

  // Strategy 4: Vision fallback — take a screenshot and ask Claude
  if (description) {
    const screenshot = await page.screenshot({ type: 'png' });
    const base64 = screenshot.toString('base64');
    const result = await identifyElementByVision(base64, description);
    if (result) {
      return {
        x: result.x,
        y: result.y,
        width: 40,
        height: 40,
      };
    }
  }

  throw new Error(
    `Could not find element: selector="${selector}", description="${description}"`
  );
}

function generateAlternativeSelectors(description: string): string[] {
  const selectors: string[] = [];
  const lower = description.toLowerCase();

  // Try by text content
  selectors.push(`text="${description}"`);
  selectors.push(`text="${lower}"`);

  // Try by aria-label
  selectors.push(`[aria-label="${description}"]`);
  selectors.push(`[aria-label*="${lower}"]`);

  // Try by placeholder
  selectors.push(`[placeholder*="${lower}"]`);

  // Try by title
  selectors.push(`[title*="${lower}"]`);

  // Try button/input by value
  selectors.push(`button:has-text("${description}")`);
  selectors.push(`a:has-text("${description}")`);
  selectors.push(`[type="submit"][value*="${lower}"]`);

  // Try by id/class containing the description words
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    selectors.push(`#${word}`);
    selectors.push(`[id*="${word}"]`);
    selectors.push(`.${word}`);
  }

  return selectors;
}

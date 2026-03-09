import Anthropic from '@anthropic-ai/sdk';
import { BrowserAction, ParsedScenario } from './types';

const SYSTEM_PROMPT = `You are a browser automation interpreter. You are given:
1. A starting URL
2. Plain English instructions describing interactions with a webpage
3. A detailed analysis of the ACTUAL page content — including every button, input, link, and their exact CSS selectors
4. A screenshot of the page

Your job is to convert the plain English instructions into a precise JSON array of browser actions, using the REAL selectors from the page analysis. Do NOT guess selectors — use the ones provided in the page analysis.

Each action must be one of these types:
- "click": Click on an element. Provide a CSS selector and a description.
- "type": Type text into a focused element or a specific input. Provide text, and optionally a selector/description.
- "scroll": Scroll the page. Provide scrollDirection ("up" or "down") and scrollAmount (pixels).
- "hover": Hover over an element. Provide a selector and description.
- "wait": Wait for a duration. Provide duration in milliseconds.
- "navigate": Navigate to a URL. Provide the url.

Guidelines:
- ALWAYS use the exact CSS selectors from the page analysis when available. These are real, verified selectors from the live page.
- Always add a "wait" action (1000-3000ms) after clicks that trigger page navigation or loading.
- For ambiguous selectors, provide a clear "description" field so vision-based fallback can find the element.
- Type actions should target specific input fields when possible.
- Be generous with waits between actions (500-1000ms minimum) for realistic pacing.
- Use the screenshot to understand the visual layout and match the user's descriptions to the correct elements.

Respond with ONLY valid JSON — no markdown, no explanation. The format must be:
{
  "actions": [
    { "type": "click", "selector": "button.login", "description": "the login button" },
    { "type": "wait", "duration": 2000 },
    { "type": "type", "selector": "#email", "description": "email input field", "text": "user@example.com" }
  ]
}`;

export async function parseInstructions(
  url: string,
  instructions: string,
  apiKey: string,
  pageAnalysis?: string,
  screenshotBase64?: string
): Promise<ParsedScenario> {
  const client = new Anthropic({ apiKey });

  // Build the user message content — include screenshot and page analysis if available
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }> = [];

  if (screenshotBase64) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: screenshotBase64,
      },
    });
  }

  let textPrompt = `Starting URL: ${url}\n\n`;
  if (pageAnalysis) {
    textPrompt += `## Page Analysis (actual elements on the page):\n${pageAnalysis}\n\n`;
  }
  textPrompt += `## User Instructions:\n${instructions}`;

  userContent.push({ type: 'text', text: textPrompt });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  // Strip markdown code fences if present
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    startUrl: url,
    actions: parsed.actions as BrowserAction[],
  };
}

export async function identifyElementByVision(
  screenshotBase64: string,
  description: string,
  apiKey: string
): Promise<{ selector: string; x: number; y: number } | null> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: `Look at this screenshot of a webpage. I need to find the element described as: "${description}"

Return ONLY a JSON object with the approximate x,y coordinates (in pixels from the top-left) of the CENTER of that element. The screenshot dimensions represent the actual viewport size.

Format: {"x": 500, "y": 300, "found": true}

If you cannot find the element, return: {"found": false}`,
          },
        ],
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const result = JSON.parse(cleaned);

  if (!result.found) return null;

  return {
    selector: `[vision-match="${description}"]`,
    x: result.x,
    y: result.y,
  };
}

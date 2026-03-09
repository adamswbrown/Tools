import Anthropic from '@anthropic-ai/sdk';
import { BrowserAction, ParsedScenario } from './types';

const SYSTEM_PROMPT = `You are a browser automation interpreter. Given a starting URL and plain English instructions describing interactions with a webpage, you must output a JSON array of browser actions.

Each action must be one of these types:
- "click": Click on an element. Provide a CSS selector and a description.
- "type": Type text into a focused element or a specific input. Provide text, and optionally a selector/description.
- "scroll": Scroll the page. Provide scrollDirection ("up" or "down") and scrollAmount (pixels).
- "hover": Hover over an element. Provide a selector and description.
- "wait": Wait for a duration. Provide duration in milliseconds.
- "navigate": Navigate to a URL. Provide the url.

Guidelines:
- Always add a "wait" action (1000-3000ms) after clicks that trigger page navigation or loading.
- Use descriptive CSS selectors when possible (button text, aria labels, data attributes, IDs).
- For ambiguous selectors, provide a clear "description" field so vision-based fallback can find the element.
- Type actions should target specific input fields when possible.
- Be generous with waits between actions (500-1000ms minimum) for realistic pacing.

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
  apiKey: string
): Promise<ParsedScenario> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Starting URL: ${url}\n\nInstructions:\n${instructions}`,
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

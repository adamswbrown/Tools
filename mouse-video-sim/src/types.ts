export interface BrowserAction {
  type: 'click' | 'type' | 'scroll' | 'hover' | 'wait' | 'navigate';
  /** CSS selector or description of the target element */
  selector?: string;
  /** Human-readable description of the element (for vision fallback) */
  description?: string;
  /** Text to type (for 'type' actions) */
  text?: string;
  /** Wait duration in milliseconds (for 'wait' actions) */
  duration?: number;
  /** URL to navigate to (for 'navigate' actions) */
  url?: string;
  /** Scroll direction */
  scrollDirection?: 'up' | 'down';
  /** Scroll amount in pixels */
  scrollAmount?: number;
}

export interface ParsedScenario {
  /** Starting URL */
  startUrl: string;
  /** Ordered list of actions to perform */
  actions: BrowserAction[];
}

export interface SimulationRequest {
  /** The URL to navigate to */
  url: string;
  /** Plain English instructions describing the interaction */
  instructions: string;
  /** Viewport width (default 1280) */
  width?: number;
  /** Viewport height (default 720) */
  height?: number;
}

export interface SimulationProgress {
  status: 'parsing' | 'launching' | 'executing' | 'recording' | 'encoding' | 'done' | 'error';
  currentAction?: number;
  totalActions?: number;
  message: string;
}

export interface MouseConfig {
  /** Mouse movement speed: 0.1 (very slow) to 3.0 (very fast). Default 1.0 */
  speed: number;
  /** Bezier curve randomness: 0 (straight lines) to 1.0 (wild curves). Default 0.3 */
  curvature: number;
  /** Micro-jitter amount: 0 (perfectly smooth) to 1.0 (shaky). Default 0.3 */
  jitter: number;
  /** Delay between actions in ms. Default 500 */
  actionDelay: number;
  /** Typing speed: delay per character in ms. Default 75 */
  typingDelay: number;
}

export const DEFAULT_MOUSE_CONFIG: MouseConfig = {
  speed: 1.0,
  curvature: 0.3,
  jitter: 0.3,
  actionDelay: 500,
  typingDelay: 75,
};

export interface ElementMatch {
  selector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

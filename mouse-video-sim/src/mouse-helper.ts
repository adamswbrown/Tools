/**
 * Injects a visible custom cursor element into the page.
 * This ensures the cursor is captured in video recordings,
 * since headless browsers don't render the system cursor.
 */
export const CURSOR_INJECT_SCRIPT = `
(() => {
  if (document.getElementById('__mouse-sim-cursor')) return;

  const cursor = document.createElement('div');
  cursor.id = '__mouse-sim-cursor';
  cursor.style.cssText = \`
    position: fixed;
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    pointer-events: none;
    z-index: 2147483647;
    transition: none;
  \`;
  cursor.innerHTML = \`
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 0 L 0 16 L 4 12 L 8 18 L 10 17 L 6 11 L 12 11 Z"
            fill="black" stroke="white" stroke-width="1"/>
    </svg>
  \`;
  document.body.appendChild(cursor);

  // Create click ripple effect
  const ripple = document.createElement('div');
  ripple.id = '__mouse-sim-ripple';
  ripple.style.cssText = \`
    position: fixed;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid rgba(66, 135, 245, 0.8);
    background: rgba(66, 135, 245, 0.2);
    pointer-events: none;
    z-index: 2147483646;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
    transition: opacity 0.3s, transform 0.3s;
  \`;
  document.body.appendChild(ripple);

  window.__moveSimCursor = (x, y) => {
    cursor.style.transform = \`translate(\${x}px, \${y}px)\`;
  };

  window.__clickSimCursor = (x, y) => {
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.opacity = '1';
    ripple.style.transform = 'translate(-50%, -50%) scale(1)';
    setTimeout(() => {
      ripple.style.opacity = '0';
      ripple.style.transform = 'translate(-50%, -50%) scale(0.5)';
    }, 300);
  };
})();
`;

/**
 * Generates points along a Bézier curve for realistic mouse movement.
 * Uses cubic Bézier with randomized control points.
 */
export function generateBezierPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number = 50
): Array<{ x: number; y: number }> {
  const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

  // More steps for longer distances
  const actualSteps = Math.max(20, Math.min(80, Math.round(distance / 8)));

  // Random control points for natural-looking curves
  const spread = distance * 0.3;
  const cp1x = startX + (endX - startX) * 0.25 + (Math.random() - 0.5) * spread;
  const cp1y = startY + (endY - startY) * 0.25 + (Math.random() - 0.5) * spread;
  const cp2x = startX + (endX - startX) * 0.75 + (Math.random() - 0.5) * spread;
  const cp2y = startY + (endY - startY) * 0.75 + (Math.random() - 0.5) * spread;

  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= actualSteps; i++) {
    const t = i / actualSteps;

    // Ease-in-out timing
    const eased = t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // Cubic Bézier formula
    const x =
      Math.pow(1 - eased, 3) * startX +
      3 * Math.pow(1 - eased, 2) * eased * cp1x +
      3 * (1 - eased) * Math.pow(eased, 2) * cp2x +
      Math.pow(eased, 3) * endX;

    const y =
      Math.pow(1 - eased, 3) * startY +
      3 * Math.pow(1 - eased, 2) * eased * cp1y +
      3 * (1 - eased) * Math.pow(eased, 2) * cp2y +
      Math.pow(eased, 3) * endY;

    // Add subtle jitter for realism
    const jitter = Math.max(0.5, distance * 0.003);
    points.push({
      x: x + (Math.random() - 0.5) * jitter,
      y: y + (Math.random() - 0.5) * jitter,
    });
  }

  // Ensure last point is exact
  points[points.length - 1] = { x: endX, y: endY };

  return points;
}

/**
 * Calculate movement duration using Fitts's Law approximation.
 * Longer distances and smaller targets take more time.
 */
export function calculateMoveDuration(
  distance: number,
  targetSize: number = 40
): number {
  const a = 200; // base time ms
  const b = 150; // scaling factor
  if (distance < 1) return a;
  return Math.round(a + b * Math.log2(distance / targetSize + 1));
}

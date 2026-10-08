/** Lateral offset of the road centre line, in metres, at track distance d. */
export const curve = (d: number): number =>
  15 * Math.sin(d / 210) + 9 * Math.sin(d / 560 + 1.3) + 7.5 * Math.sin(d / 88 + 0.6);

/** Second derivative of the road line: how hard the current turn pulls. */
export const bend = (d: number): number =>
  (curve(d + 14) - 2 * curve(d) + curve(d - 14)) / 196;

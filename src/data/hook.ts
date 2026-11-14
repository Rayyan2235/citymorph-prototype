// Opening hook on the intro screen. Every figure here is public and sourced.
// The vacant square footage is derived (rate × inventory), so the source line
// shows the inputs instead of claiming a published total.
export const HOOK = {
  vacantMillionSqFt: 57, // 24.0% total vacancy × 237,945,787 sq ft inventory
  line: 'of Houston office space sits empty. Owners have started tearing buildings down.',
  source: 'Lee & Associates, Houston office Q3 2026: 24.0% of 237.9M sq ft vacant · CRE Daily, Jul 2026',
} as const

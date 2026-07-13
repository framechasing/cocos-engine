/**
 * Feature flag gating all BackportSorting2D code, so the feature stays removable/
 * opt-in. Referenced from backport-sorting-2d.ts, renderable-2d.ts (priority field),
 * and batcher-2d.ts.
 *
 * This is a plain runtime constant, not a build-time macro like 3.8.8's
 * USE_SORTING_2D (which is stripped by the bundler via internal:constants).
 * 3.5.2's build has no registration point for a new internal constant without
 * touching the build config. If dead-code elimination matters later, this can
 * be wired into cc.config.json's engine macros instead.
 */
export const USE_BACKPORT_SORTING_2D = true;

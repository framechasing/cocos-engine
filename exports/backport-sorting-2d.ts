/**
 * Re-export module for the BackportSorting2D feature, alongside 3.8.8's own
 * exports/sorting-2d.ts (which this mirrors). Registered into the public 'cc'
 * package the same way as 3.5.2's other exports/*.ts modules.
 */

export { BackportSortingLayers } from '../cocos/sorting/backport-sorting-layers';
export { BackportSorting2D } from '../cocos/sorting/backport-sorting-2d';
// RichText companion component — no 3.8.8 counterpart; see
// cocos/sorting/backport-rich-text-sorting-2d.ts's header.
export { BackportRichTextSorting2D } from '../cocos/sorting/backport-rich-text-sorting-2d';
// Subtree sorting-group component — no 3.8.8 counterpart; see
// cocos/sorting/backport-sorting-group-2d.ts's header.
export { BackportSortingGroup2D } from '../cocos/sorting/backport-sorting-group-2d';

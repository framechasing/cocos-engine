/**
 * BackportSortingLayers — priority packing for BackportSorting2D. Backport of Cocos
 * Creator 3.8.8's cocos/sorting/sorting-layers.ts for the 3.5.2 engine, but
 * deliberately simplified (project owner's call, 2026-07-09): 3.8.8's named-layer
 * registry — stable ids, an editable Enum, a Project Settings-backed dropdown — is
 * dropped entirely. `sortingLayer` is a plain signed int16; its value IS the
 * render-order rank, with no id/name/index indirection and no registration step.
 * This trades away named layers and the append-only-id serialization guarantee for
 * zero configuration: there's no registry to keep in sync with project data, no
 * backport-sorting-layers.config.ts, and no Inspector dropdown to populate.
 */

const DEFAULT_LAYER = 0;

/**
 * Sorting priority helper. Layer has higher sorting priority than sortingOrder —
 * see getSortingPriority().
 */
export class BackportSortingLayers {
    /**
     * Calculate sorting priority. Packs layer into the high 16 bits and order
     * into the low 16 bits of a uint32, so a plain numeric sort orders by
     * layer first, order second. Ported unchanged from 3.8.8.
     */
    public static getSortingPriority (layer = 0, order = 0): number {
        return (((layer + (1 << 15)) << 16) | (order + (1 << 15))) >>> 0;
    }

    public static getDefaultPriority (): number {
        return this.getSortingPriority(DEFAULT_LAYER, 0);
    }
}

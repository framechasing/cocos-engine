/**
 * BackportRichTextSorting2D helper component — NO 3.8.8 COUNTERPART. Unlike the
 * rest of the BackportSorting2D family, this one isn't part of the 3.8.8 parity
 * surface: upstream 3.8.8 has no such class, and for the same reason it would be
 * needed there too — BackportSorting2D cannot target RichText because RichText's
 * node carries no UIRenderer/Renderable2D: its visible content lives on child
 * `Label`/`Sprite` segment nodes that RichText wipes and regenerates on every
 * text change, so a BackportSorting2D placed on a segment would be lost immediately.
 *
 * This component works around that without touching rich-text.ts. It extends
 * BackportSorting2D, inheriting the `sortingLayer`/`sortingOrder` Inspector surface,
 * their serialized fields, and the batcher activation counting done by the
 * base's onEnable/onDisable (a subclass instance counts as one more enabled
 * BackportSorting2D — no separate counter, no extra hook into any mirrored module).
 * It overrides the two behaviors that differ:
 *
 *   - `__preload`: requires a RichText instead of a Renderable2D. Deliberately
 *     does NOT call super — the base's __preload would look for a Renderable2D
 *     on this node, which a RichText node never has, and log a spurious
 *     "requires a Renderable2D" error instead of the correct RichText-specific one.
 *   - `_updateSortingPriority`: instead of driving the (nonexistent) renderer
 *     on this node, stamps `BackportSortingLayers.getSortingPriority(layer, order)`
 *     onto each segment child's renderer, re-stamping when RichText
 *     regenerates segments (Node CHILD_ADDED). Only nodes named
 *     RICHTEXT_CHILD / RICHTEXT_Image_CHILD (rich-text.ts's segment names) are
 *     touched, so an unrelated child node's own BackportSorting2D is never overwritten.
 *
 * The CHILD_REMOVED reset is load-bearing, not cleanup pedantry: rich-text.ts
 * recycles segment nodes through MODULE-LEVEL shared pools (labelPool /
 * imagePool), so a stamped priority would otherwise leak into whichever
 * RichText anywhere in the scene reuses the node next.
 *
 * UPGRADE CAVEAT (accepted by project owner 2026-07-06): stock 3.8+ does not
 * ship this class, so on engine upgrade every scene/prefab using it gets a
 * missing-script reference. Either recreate it as a project script then, or
 * strip the component from scenes before upgrading. If recreating: make it a
 * standalone Component, NOT a subclass of 3.8's Sorting2D — that class carries
 * `@requireComponent(UIRenderer)`, which subclasses inherit, so it would
 * auto-add a bare UIRenderer on the RichText node that crashes on first render
 * (the exact upstream bug this backport avoids here in 3.5.2). Subclassing is
 * only safe against THIS backported copy, whose decorator has been removed.
 */

import { ccclass, disallowMultiple, executeInEditMode, menu } from 'cc.decorator';
import { error } from '../core/platform/debug';
import { NodeEventType } from '../core/scene-graph/node-event';
import type { Node } from '../core/scene-graph/node';
import { Renderable2D } from '../2d/framework/renderable-2d';
import { RichText } from '../2d/components/rich-text';
import { BackportSortingLayers } from './backport-sorting-layers';
import { BackportSorting2D } from './backport-sorting-2d';

// Segment node names, duplicated from cocos/2d/components/rich-text.ts (they are
// module-private constants there; rich-text.ts itself identifies its segments by
// these same name comparisons, e.g. in _resetState).
const RichTextChildName = 'RICHTEXT_CHILD';
const RichTextChildImageName = 'RICHTEXT_Image_CHILD';

/**
 * BackportSorting2D variant for RichText: applies the sorting layer/order to the
 * RichText's regenerated `Label`/`Sprite` segment children instead of a
 * renderer on this node.
 */
@ccclass('cc.BackportRichTextSorting2D')
@menu('Sorting/BackportRichTextSorting2D')
@disallowMultiple
@executeInEditMode
export class BackportRichTextSorting2D extends BackportSorting2D {
    // Mirrors the base's `_isBackportSorting2DEnabled`, which is private there. It must
    // be set BEFORE the super lifecycle calls below, because those re-enter the
    // overridden _updateSortingPriority().
    private _segmentSortingEnabled = false;

    public __preload (): void {
        // Deliberately no super.__preload() — see the file header. Matches
        // BackportSorting2D's own behavior (backport-sorting-2d.ts): log and
        // leave the component attached (inert — _updateSortingPriority has no
        // RichText segments to stamp), rather than removing it, so it isn't
        // silently dropped from the node in the editor.
        if (!this.getComponent(RichText)) {
            error(`BackportRichTextSorting2D on node "${this.node.name}" requires a RichText component.`);
        }
    }

    public onEnable (): void {
        this._segmentSortingEnabled = true;
        this.node.on(NodeEventType.CHILD_ADDED, this._onChildAdded, this);
        this.node.on(NodeEventType.CHILD_REMOVED, this._onChildRemoved, this);
        // Stamps current segments (via the override below) and registers this
        // component in the batcher's activation count.
        super.onEnable();
    }

    public onDisable (): void {
        this._segmentSortingEnabled = false;
        this.node.off(NodeEventType.CHILD_ADDED, this._onChildAdded, this);
        this.node.off(NodeEventType.CHILD_REMOVED, this._onChildRemoved, this);
        // Resets segments to the default priority and unregisters from the
        // activation count.
        super.onDisable();
    }

    private _onChildAdded (child: Node): void {
        this._applyToSegment(child, this._segmentSortingEnabled);
    }

    private _onChildRemoved (child: Node): void {
        // Reset before the node goes back into rich-text.ts's shared segment
        // pool — see the file header.
        this._applyToSegment(child, false);
    }

    protected _updateSortingPriority (): void {
        const children = this.node.children;
        for (let i = 0; i < children.length; i++) {
            this._applyToSegment(children[i], this._segmentSortingEnabled);
        }
    }

    private _applyToSegment (child: Node, sorted: boolean): void {
        if (child.name !== RichTextChildName && child.name !== RichTextChildImageName) return;
        const renderable = child.getComponent(Renderable2D);
        if (!renderable || !renderable.isValid) return;
        if (sorted) {
            renderable.priority = BackportSortingLayers.getSortingPriority(this._sortingLayer, this._sortingOrder);
        } else {
            renderable.priority = BackportSortingLayers.getDefaultPriority();
        }
    }
}

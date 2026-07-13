/**
 * BackportSorting2D component — backport of Cocos Creator 3.8.8's cocos/sorting/sorting-2d.ts
 * for the 3.5.2 engine.
 *
 * 3.5.2 has no `UIRenderer` class — the 2D renderable base class is still named
 * `Renderable2D` (UIRenderer is a 3.6+ rename) and it has no `priority` field.
 * That field is added by the accompanying change to cocos/2d/framework/renderable-2d.ts.
 *
 * `sortingLayer` is a plain int16, not a named/registered layer (see
 * backport-sorting-layers.ts's header for why the registry was dropped) — same
 * range and clamping treatment as `sortingOrder`, no Inspector dropdown.
 *
 * Deliberately diverges from 3.8.8 here: upstream's `@requireComponent(UIRenderer)`
 * auto-adds a bare, non-abstract `Renderable2D`/`UIRenderer` on nodes with no real
 * renderer (e.g. RichText) instead of rejecting the add — the bare instance has no
 * `_assembler` (only concrete subclasses like Sprite/Label set one), so the first
 * render throws. Upstream 3.8.8 has the identical bug, so there is no defined
 * upstream behavior being preserved by mirroring it; this copy drops
 * `@requireComponent` and rejects in `__preload` instead — logs an error and
 * leaves the component attached (inert — nothing for `_updateSortingPriority` to
 * stamp a priority onto) rather than removed, so it isn't silently dropped from
 * the node in the editor.
 */

import { ccclass, disallowMultiple, executeInEditMode, menu, range, serializable } from 'cc.decorator';
import { clamp } from '../core/math';
import { Component } from '../core/components/component';
import { error } from '../core/platform/debug';
import { Renderable2D } from '../2d/framework/renderable-2d';
import { BackportSortingLayers } from './backport-sorting-layers';
import { _setBackportSorting2DCount } from '../2d/renderer/batcher-2d';

const MAX_INT16 = (1 << 15) - 1;
const MIN_INT16 = -1 << 15;

let backportSorting2DCount = 0;

/**
 * 2D Render sort component.
 */
@ccclass('cc.BackportSorting2D')
@menu('Sorting/BackportSorting2D')
@disallowMultiple
@executeInEditMode
export class BackportSorting2D extends Component {
    private _isBackportSorting2DEnabled = false;
    private _renderable: Renderable2D | null = null;

    /**
     * Coarse render-order grouping, compared before sortingOrder. In the default
     * sorting rule, smaller values are rendered first.
     */
    @range([MIN_INT16, MAX_INT16, 1])
    get sortingLayer (): number {
        return this._sortingLayer;
    }
    set sortingLayer (val) {
        if (val === this._sortingLayer) return;
        this._sortingLayer = clamp(val, MIN_INT16, MAX_INT16);
        this._updateSortingPriority();
    }

    /**
     * Render order within a sorting layer. In the default sorting rule, smaller values are rendered first.
     */
    @range([MIN_INT16, MAX_INT16, 1])
    get sortingOrder (): number {
        return this._sortingOrder;
    }
    set sortingOrder (val) {
        if (val === this._sortingOrder) return;
        this._sortingOrder = clamp(val, MIN_INT16, MAX_INT16);
        this._updateSortingPriority();
    }

    @serializable
    protected _sortingLayer = 0;
    @serializable
    protected _sortingOrder = 0;

    public __preload (): void {
        this._renderable = this.getComponent(Renderable2D);
        if (!this._renderable) {
            // Reject instead of upstream's auto-add-a-bare-Renderable2D-then-crash-on-first-render behavior.
            error(`BackportSorting2D on node "${this.node.name}" requires a Renderable2D component.`);
        }
    }

    public onEnable (): void {
        this._isBackportSorting2DEnabled = true;
        this._updateSortingPriority();
        ++backportSorting2DCount;
        _setBackportSorting2DCount(backportSorting2DCount);
    }

    public onDisable (): void {
        this._isBackportSorting2DEnabled = false;
        this._updateSortingPriority();
        --backportSorting2DCount;
        _setBackportSorting2DCount(backportSorting2DCount);
    }

    protected _updateSortingPriority (): void {
        const renderable = this._renderable;
        if (renderable && renderable.isValid) {
            if (this._isBackportSorting2DEnabled) {
                renderable.priority = BackportSortingLayers.getSortingPriority(this._sortingLayer, this._sortingOrder);
            } else {
                renderable.priority = BackportSortingLayers.getDefaultPriority();
            }
        }
    }
}

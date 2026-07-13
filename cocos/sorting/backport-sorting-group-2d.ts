/**
 * BackportSortingGroup2D — a subtree "sorting group" for the 3.5.2 Sorting2D backport.
 * No 3.8.8 counterpart — stock Cocos has no 2D sorting-group concept; this is
 * new functionality added alongside the backport, not a port of upstream code.
 *
 * WHAT IT DOES: the group OWNS all priority within its subtree. Descendants matching
 * `targetType` get ONE shared render rank —
 * BackportSortingLayers.getSortingPriority(sortingLayer, sortingOrder) — and every OTHER
 * Renderable2D in scope is forced to the default priority. The scope therefore sorts as a
 * single block against other content in the same Canvas while KEEPING its internal (tree)
 * order: the batcher's flat priority sort is stable, so equal-priority entries stay in
 * walk (= tree) order. A flat cascade is the only way to get group behavior — the batcher's
 * sort has no hierarchy, so "sort scope X as a block at rank R" requires every renderer in
 * X to hold priority R.
 *
 * SCOPE — `targetType` (SortingGroupTargetType enum, default ALL): which descendants get
 * the group rank. ALL = every Renderable2D in scope; LABEL = only Label renderers (e.g.
 * "sort all Labels in this subtree above everything else"). Non-matching in-scope
 * Renderable2D are forced to default. Traversal always descends the WHOLE subtree
 * regardless of match (a Label nested under a Sprite is still reached). This is one rank
 * for the whole group, deliberately NOT a per-node/per-type editor — for different ranks
 * per node or type, use per-node BackportSorting2D.
 *
 * OWNERSHIP BOUNDARY: a descendant carrying its own BackportSorting2D-family component
 * (a plain BackportSorting2D, a RichText variant, or a nested BackportSortingGroup2D)
 * manages its own subtree — the group skips that node AND stops descending into it.
 * getComponent(BackportSorting2D) catches all three because each extends it.
 *
 * DYNAMIC CHILDREN: by default the group does NOT watch for child add/remove. After ANY
 * structural change to the subtree (adding, removing, reparenting, or a deeper mutation),
 * call refresh() to re-stamp. Nothing happens automatically: a newly added child renders at
 * the default priority until refresh()/re-enable/a layer-order change, and a REMOVED child
 * keeps the group's rank until onDisable or a refresh() — reset it (or refresh()) before
 * pooling/reparenting it elsewhere, or it carries the group's priority to wherever it
 * lands next.
 *
 * OPT-IN CHILD WATCH — `watchChildren` (bool, default false): when on, the group watches its
 * OWN node's DIRECT children for add/remove and keeps them sorted automatically, so you attach
 * the group directly to the dynamic container (e.g. a ScrollView's `content` node) and its items
 * are its direct children. While enabled the group listens for CHILD_ADDED/CHILD_REMOVED on
 * this.node and does an INCREMENTAL, O(added/removed subtree) update: it re-syncs a newly added
 * child's subtree (reset to default, then stamp the matching renderers — same as a refresh()
 * scoped to that subtree, so a recycled child can't keep a stale rank), and resets a removed
 * child's subtree to default (so a pooled/reparented item does not carry the group rank away —
 * the leak the manual path warns about). Deliberately DIRECT-children-only: it does NOT catch
 * deep mutations inside an existing child (e.g. a renderer instantiated on data-bind into an
 * item already in the container) — those still need refresh(). Watching this.node (never an
 * arbitrary node) means the watched children are always the top of the group's own scope, so no
 * ownership/scope validation is needed. Default off = no watch (unchanged behavior, honoring the
 * 2026-07-10 "no auto-watch by default" decision). NOTE: for the whole-list-as-a-block case the
 * incremental per-item cost is cheap even under fast scroll (one item subtree per recycle event,
 * not a full rescan); refresh() is the expensive path to avoid per-frame, not this.
 *
 * COST: the frequent paths are cheap — onEnable and sortingLayer/sortingOrder changes only
 * re-stamp (onDisable already left the subtree at default). A full-subtree reset-then-stamp
 * happens only where scope can shrink: a `targetType` change, onDisable, and refresh().
 * refresh() re-stamps the whole scope, so avoid calling it every frame on a large recycling
 * container (e.g. a ScrollView that reuses hundreds of item nodes) — stamp those items with
 * a plain BackportSorting2D instead.
 *
 * WHY IT EXTENDS BackportSorting2D: to reuse the serialized `sortingLayer`/`sortingOrder`
 * surface AND the batcher activation counting done by the base's onEnable/onDisable. That
 * counting is load-bearing — the batcher only enters its collect-sort-emit path while
 * backportSorting2DCount > 0 (batcher-2d.ts), and _setBackportSorting2DCount is an absolute
 * set, so a separate counter would stomp the base's. Inheriting makes a group instance count
 * as one more enabled BackportSorting2D with no new batcher hook. It overrides:
 *   - `__preload`: NO super call — a group is a container, so the base's "requires a
 *     Renderable2D on this node" check would be wrong.
 *   - `_updateSortingPriority`: walks descendants instead of driving this node's renderer.
 *
 * UPGRADE CAVEAT: stock 3.8+ does not ship this class, so on engine upgrade every
 * scene/prefab using it gets a missing-script reference. Recreate it as a project script
 * then, or strip it from scenes before upgrading. If recreating: make it a standalone
 * Component, NOT a subclass of 3.8's Sorting2D — that class carries
 * `@requireComponent(UIRenderer)`, which subclasses inherit and which would auto-add a bare
 * UIRenderer on the container node that crashes on first render. Subclassing is only safe
 * against THIS patched BackportSorting2D, whose decorator has been removed.
 */

import { ccclass, disallowMultiple, editable, executeInEditMode, menu, serializable, tooltip, type } from 'cc.decorator';
import { ccenum } from '../core/value-types/enum';
import type { Node } from '../core/scene-graph/node';
import { NodeEventType } from '../core/scene-graph/node-event';
import { Renderable2D } from '../2d/framework/renderable-2d';
import { Label } from '../2d/components/label';
import { BackportSortingLayers } from './backport-sorting-layers';
import { BackportSorting2D } from './backport-sorting-2d';

/**
 * Which descendant renderers a BackportSortingGroup2D stamps. Intentionally a small
 * fixed set (a dropdown for the cases this project actually needs) rather than every
 * registered Renderable2D subclass — that would require the editor-time class-registry
 * enum machinery BackportSortingLayers deliberately dropped (2026-07-09). Extend this
 * enum by hand if another type is genuinely needed.
 */
export enum SortingGroupTargetType {
    /** Every Renderable2D in scope. */
    ALL = 0,
    /** Only Label renderers (e.g. "sort all text above everything else"). */
    LABEL = 1,
}
ccenum(SortingGroupTargetType);

/**
 * Applies one shared BackportSorting2D layer/order to a scoped set of descendant
 * Renderable2D nodes, so they sort as a block while keeping their internal order.
 */
@ccclass('cc.BackportSortingGroup2D')
@menu('Sorting/BackportSortingGroup2D')
@disallowMultiple
@executeInEditMode
export class BackportSortingGroup2D extends BackportSorting2D {
    // Mirrors the base's `_isBackportSorting2DEnabled`, which is private there. It must
    // be set BEFORE the super lifecycle calls below, because those re-enter the
    // overridden _updateSortingPriority().
    private _groupSortingEnabled = false;

    @serializable
    protected _targetType = SortingGroupTargetType.ALL;

    /**
     * Restrict stamping to a renderer type. ALL = every Renderable2D; LABEL = only
     * Labels. Only which nodes are written is affected; traversal is unchanged (a Label
     * nested under a non-Label parent is still reached).
     */
    @editable
    @type(SortingGroupTargetType)
    @tooltip('Restrict stamping to a renderer type. All = every Renderable2D; Label = only Labels.')
    get targetType (): SortingGroupTargetType {
        return this._targetType;
    }
    set targetType (val: SortingGroupTargetType) {
        if (val === this._targetType) return;
        this._targetType = val;
        // Scope membership can shrink (e.g. ALL -> LABEL) — full reset then re-stamp.
        this._rescope();
    }

    @serializable
    protected _watchChildren = false;

    /**
     * Opt-in incremental child watch. When on, the group watches its OWN node's DIRECT children
     * for add/remove and auto-stamps/resets them — attach the group to the dynamic container
     * (e.g. a ScrollView `content` node) whose items are its direct children. false (default) =
     * no watch; use refresh() after structural changes instead. Direct-children-only: deep
     * mutations inside an existing child still need refresh(). See the OPT-IN CHILD WATCH note
     * in the file header.
     */
    @editable
    @tooltip('Auto-sort this node\'s direct children as they are added/removed (attach to the dynamic container, e.g. a ScrollView content node). Deep changes inside a child still need refresh(). Off = manual refresh() only.')
    get watchChildren (): boolean {
        return this._watchChildren;
    }
    set watchChildren (val: boolean) {
        if (val === this._watchChildren) return;
        this._watchChildren = val;
        // Toggle the live subscription. The current children were already covered by the last
        // full-scope stamp, so enabling the watch only governs FUTURE add/remove — no re-stamp.
        if (!this._groupSortingEnabled) return;
        if (val) this._subscribeWatch();
        else this._unsubscribeWatch();
    }

    public __preload (): void {
        // Deliberately NO super.__preload() — a group is a container. The base would
        // require a Renderable2D on this node and log a spurious error; this component
        // drives its descendants, not a renderer on its own node.
    }

    public onEnable (): void {
        this._groupSortingEnabled = true;
        // Stamps the current scope (via the override below) and registers this
        // component in the batcher's activation count.
        super.onEnable();
        // Subscribe AFTER the full-scope stamp (no-op unless watchChildren is on) so the
        // current children are already at the group rank; the listener only handles
        // subsequent add/remove.
        this._subscribeWatch();
    }

    public onDisable (): void {
        // Stop watching first so no add/remove fires mid-teardown.
        this._unsubscribeWatch();
        this._groupSortingEnabled = false;
        // Resets the scope to the default priority and unregisters from the
        // activation count.
        super.onDisable();
    }

    /**
     * Re-sync the whole scope: reset the subtree to default, then (while enabled)
     * re-stamp the current scope. Full-subtree re-sync point for structural changes the
     * opt-in `watchChildren` does NOT cover — deep mutations inside an existing child, or any
     * change at all when watchChildren is off. With watchChildren on, add/remove of this
     * node's direct children is handled incrementally without calling this.
     */
    public refresh (): void {
        this._rescope();
    }

    // Called by the base's sortingLayer/sortingOrder setters and by super.onEnable/
    // onDisable. Scope membership never changes on these paths, so this is stamp-only
    // when enabled (cheap — the frequent path, e.g. animating sortingOrder) and a full
    // reset when disabled (the load-bearing "turn the group off -> everything back to
    // default" step, which is also what lets onEnable stay stamp-only). Scope-SHRINKING
    // changes (targetType) go through _rescope() instead.
    protected _updateSortingPriority (): void {
        if (this._groupSortingEnabled) {
            this._stampScope();
        } else {
            this._resetScope();
        }
    }

    // Full reset of the whole subtree, then (while enabled) re-stamp the current scope.
    // Used where scope membership may have shrunk, so a plain stamp would strand nodes
    // that just left the scope at their old rank.
    private _rescope (): void {
        this._resetScope();
        if (this._groupSortingEnabled) this._stampScope();
    }

    private _resetScope (): void {
        const children = this.node.children;
        for (let i = 0; i < children.length; i++) {
            this._resetSubtree(children[i]);
        }
    }

    private _stampScope (): void {
        const children = this.node.children;
        for (let i = 0; i < children.length; i++) {
            this._stampSubtree(children[i]);
        }
    }

    private _resetSubtree (node: Node): void {
        // Full-subtree reset to default. Unmanaged deeper nodes are already at default,
        // so forcing default there is a harmless no-op.
        if (node.getComponent(BackportSorting2D)) return;   // ownership boundary
        const renderable = node.getComponent(Renderable2D);
        if (renderable && renderable.isValid) {
            renderable.priority = BackportSortingLayers.getDefaultPriority();
        }
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            this._resetSubtree(children[i]);
        }
    }

    private _stampSubtree (node: Node): void {
        // Ownership boundary: a node with its own BackportSorting2D-family component
        // (plain, RichText variant, or a nested group — all extend BackportSorting2D)
        // manages its own subtree. Skip it and do not descend.
        if (node.getComponent(BackportSorting2D)) return;

        this._stampNode(node);

        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            this._stampSubtree(children[i]);
        }
    }

    private _stampNode (node: Node): void {
        // targetType gates which nodes get the group rank; everything else in scope was
        // already set to default by the reset pass. Label extends Renderable2D, so both
        // branches yield a Renderable2D (or null) — no instanceof needed.
        const comp = this._targetType === SortingGroupTargetType.LABEL
            ? node.getComponent(Label)
            : node.getComponent(Renderable2D);
        if (!comp || !comp.isValid) return;
        comp.priority = BackportSortingLayers.getSortingPriority(this._sortingLayer, this._sortingOrder);
    }

    private _subscribeWatch (): void {
        if (!this._watchChildren) return;
        // Watch this.node — the group's own node, whose direct children are the top of the
        // scope it already stamps, so no ownership/scope check is needed.
        this.node.on(NodeEventType.CHILD_ADDED, this._onWatchedChildAdded, this);
        this.node.on(NodeEventType.CHILD_REMOVED, this._onWatchedChildRemoved, this);
    }

    private _unsubscribeWatch (): void {
        // off() with the same references is a harmless no-op if we never subscribed
        // (watchChildren off), so this is safe to call unconditionally.
        this.node.off(NodeEventType.CHILD_ADDED, this._onWatchedChildAdded, this);
        this.node.off(NodeEventType.CHILD_REMOVED, this._onWatchedChildRemoved, this);
    }

    private _onWatchedChildAdded (child: Node): void {
        // Belt-and-suspenders: we only subscribe while enabled, but guard against re-entrancy.
        if (!this._groupSortingEnabled) return;
        // Reset THEN stamp, mirroring _rescope() scoped to this one subtree: with a
        // scope-narrowing targetType (e.g. LABEL) a stamp-only pass would leave a RECYCLED
        // child's non-matching renderers holding a stale rank from a previous owner. The
        // reset forces every renderer in the added subtree to default first; the stamp then
        // lifts only the matching ones — the group's "others forced to default" invariant.
        this._resetSubtree(child);
        this._stampSubtree(child);
    }

    private _onWatchedChildRemoved (child: Node): void {
        // Reset the departing subtree to default so a pooled/reparented item does not carry
        // the group's rank into its next home.
        this._resetSubtree(child);
    }
}

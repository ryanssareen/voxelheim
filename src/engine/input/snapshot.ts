import {
  clampMoveVector,
  type DeltaIntent,
  type EdgeIntent,
  type HeldIntent,
  type InputSource,
  type IntentEdge,
  type SuppressionReason,
  type Vec2,
} from "@engine/input/intents";

/**
 * The per-frame intent state every consumer reads.
 *
 * One shared module rather than resolution split between the controller and the
 * engine loop: physics already lives in three places in this codebase and the
 * lesson recorded from that (docs/solutions/logic-errors/aabb-max-edge-phantom-
 * block-collision.md) is that duplicated logic is where fixes go to die.
 *
 * **Edges are read through per-consumer cursors.** Seven consumers read this —
 * the frame loop, the player controller, and five React listeners — and a
 * consume-on-read queue would let whichever ran first starve the rest silently:
 * a chat-open edge drained by the frame loop would simply never reach chat, with
 * no error anywhere. Each consumer registers once and advances its own cursor,
 * so every consumer observes every edge exactly once.
 */

/** Edges older than this are dropped so an idle queue cannot grow forever. */
const EDGE_TTL_MS = 2000;

export interface IntentSnapshot {
  /** True while the control is down. */
  isHeld(intent: HeldIntent): boolean;
  /** Continuous accumulated input, reset each frame by the source. */
  delta(intent: DeltaIntent): Vec2;
  /**
   * Edges not yet seen by this consumer, oldest first. Advances that consumer's
   * cursor; other consumers are unaffected.
   */
  takeEdges(consumer: string): IntentEdge[];
  /** Convenience: did this consumer see this edge kind since it last read? */
  tookEdge(consumer: string, intent: EdgeIntent): boolean;
  /**
   * Delivers each edge to `listener` the moment it is pushed. Returns an
   * unsubscribe.
   *
   * The frame loop and the player controller pull edges through cursors,
   * because they run on a frame boundary and want a frame's worth at a time.
   * The React listeners (U5) cannot: they live outside the loop, and pulling
   * would put them in a race with `drain()` — the debug overlay toggles while a
   * panel is open today, and whether a poll landed before or after that frame's
   * drain would decide whether F3 worked. Push delivery removes the race and
   * the poll latency together.
   *
   * Not gated on suppression, deliberately. Suppression means *gameplay* input
   * is being ignored; the surfaces on this face — chat, the debug overlay, the
   * minimap, modal dismissal — are precisely the ones that must keep working
   * while it is, exactly as they do today while the game is paused.
   */
  onEdge(listener: (edge: IntentEdge) => void): () => void;
  /** Null when gameplay input is live. */
  readonly suppressedBy: SuppressionReason | null;
  readonly source: InputSource;
}

/**
 * Mutable backing store. Sources write; `IntentSnapshot` is the read face.
 */
export class IntentState implements IntentSnapshot {
  private held = new Set<HeldIntent>();
  private deltas = new Map<DeltaIntent, Vec2>();
  private edges: IntentEdge[] = [];
  /** Monotonic id of the next edge to be appended. */
  private nextId = 0;
  /** Per-consumer cursor into the edge stream, keyed by consumer name. */
  private cursors = new Map<string, number>();
  private suppression: SuppressionReason | null = null;
  private activeSource: InputSource = "keyboardMouse";
  /** Push-face subscribers; see {@link IntentSnapshot.onEdge}. */
  private edgeListeners = new Set<(edge: IntentEdge) => void>();

  get suppressedBy(): SuppressionReason | null {
    return this.suppression;
  }

  get source(): InputSource {
    return this.activeSource;
  }

  // ---------------------------------------------------------------- writes

  setHeld(intent: HeldIntent, down: boolean): void {
    if (down) this.held.add(intent);
    else this.held.delete(intent);
  }

  pushEdge(intent: EdgeIntent, at: number): void {
    const edge: IntentEdge = { intent, at };
    this.edges.push(edge);
    this.nextId++;
    this.prune(at);
    // After the queue is consistent, so a listener that turns round and calls
    // takeEdges() sees the same stream a puller would.
    for (const listener of this.edgeListeners) listener(edge);
  }

  addDelta(intent: DeltaIntent, dx: number, dy: number): void {
    const cur = this.deltas.get(intent) ?? { x: 0, y: 0 };
    this.deltas.set(intent, { x: cur.x + dx, y: cur.y + dy });
  }

  setDelta(intent: DeltaIntent, v: Vec2): void {
    this.deltas.set(intent, intent === "move" ? clampMoveVector(v) : { ...v });
  }

  setSource(source: InputSource): void {
    this.activeSource = source;
  }

  setSuppression(reason: SuppressionReason | null): void {
    this.suppression = reason;
  }

  // ---------------------------------------------------------------- reads

  isHeld(intent: HeldIntent): boolean {
    return this.suppression === null && this.held.has(intent);
  }

  delta(intent: DeltaIntent): Vec2 {
    if (this.suppression !== null) return { x: 0, y: 0 };
    return this.deltas.get(intent) ?? { x: 0, y: 0 };
  }

  takeEdges(consumer: string): IntentEdge[] {
    const seen = this.cursors.get(consumer) ?? this.nextId - this.edges.length;
    const firstId = this.nextId - this.edges.length;
    const from = Math.max(0, seen - firstId);
    this.cursors.set(consumer, this.nextId);
    if (this.suppression !== null) return [];
    return this.edges.slice(from);
  }

  tookEdge(consumer: string, intent: EdgeIntent): boolean {
    return this.takeEdges(consumer).some((e) => e.intent === intent);
  }

  onEdge(listener: (edge: IntentEdge) => void): () => void {
    this.edgeListeners.add(listener);
    return () => {
      this.edgeListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------- frame

  /**
   * Clears continuous deltas. Called once per frame by the source after every
   * consumer has read, so deltas describe one frame rather than accumulating.
   */
  clearDeltas(): void {
    this.deltas.clear();
  }

  /**
   * Discards every buffered edge **and** any accumulated delta, advancing all
   * cursors past them.
   *
   * Both halves matter. The engine drains buffered clicks when a panel is open
   * so a click made over an inventory does not place a block on the frame it
   * closes — and it separately throws away mouse movement on suppressed frames,
   * which is the only reason the camera does not snap on resume. Once look stops
   * being gated on pointer lock, dropping the delta half would reintroduce that
   * snap.
   */
  drain(): void {
    this.edges.length = 0;
    this.deltas.clear();
    for (const consumer of this.cursors.keys()) this.cursors.set(consumer, this.nextId);
  }

  /** Releases every held control, e.g. when focus is lost. */
  releaseAll(): void {
    this.held.clear();
    this.deltas.clear();
  }

  private prune(now: number): void {
    if (this.edges.length === 0) return;
    let drop = 0;
    while (drop < this.edges.length && now - this.edges[drop].at > EDGE_TTL_MS) drop++;
    if (drop > 0) this.edges.splice(0, drop);
  }
}

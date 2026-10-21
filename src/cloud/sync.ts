import { cloudSnapshot } from "./snapshot";
import type { Save } from "../model";

export interface CloudReply {
  revision: number;
  serverNow: number;
  leaseUntil: number;
  snapshot?: Save;
}
export interface CloudTransport {
  claim(lease: string, initial?: Save): Promise<CloudReply>;
  commit(
    lease: string,
    revision: number,
    request: string,
    snapshot: Save,
  ): Promise<CloudReply>;
  heartbeat(lease: string): Promise<CloudReply>;
  release(lease: string): Promise<void>;
}
export type SyncState = "idle" | "saving" | "saved" | "retry" | "lost";
const FATAL =
  /SESSION_LOST|SESSION_BUSY|REVISION_CONFLICT|REQUEST_MISMATCH|AUTH_REQUIRED|JWT|INVALID_SAVE/;
function makeUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return [...bytes]
    .map(
      (b, i) =>
        ([4, 6, 8, 10].includes(i) ? "-" : "") +
        b.toString(16).padStart(2, "0"),
    )
    .join("");
}

/** One in-flight request. Retry the exact receipt before sending a newer snapshot. */
export class CloudSync {
  private lease = "";
  private revision = 0;
  private deadline = 0;
  private pending?: { request: string; snapshot: Save };
  private latest?: Save;
  private flight?: Promise<void>;
  private closing = false;
  state: SyncState = "idle";
  constructor(
    private transport: CloudTransport,
    private onState: (state: SyncState) => void = () => {},
    private now = () => performance.now(),
    private uuid: () => string = makeUuid,
  ) {}
  get active() {
    return !!this.lease && this.state !== "lost";
  }
  invalidate() {
    if (this.state !== "lost") this.status("lost");
  }
  private status(state: SyncState) {
    this.state = state;
    this.onState(state);
  }
  private time(reply: CloudReply) {
    if (
      !Number.isSafeInteger(reply.revision) ||
      reply.revision < 1 ||
      !Number.isFinite(reply.serverNow) ||
      !Number.isFinite(reply.leaseUntil)
    )
      throw new Error("INVALID_SAVE");
    this.deadline =
      this.now() + Math.max(0, reply.leaseUntil - reply.serverNow - 5000);
    this.revision = reply.revision;
  }
  async open(initial?: Save) {
    if (this.lease) throw new Error("SESSION_BUSY");
    const lease = this.uuid();
    const reply = await this.transport.claim(
      lease,
      initial && cloudSnapshot(initial),
    );
    try {
      const snapshot = cloudSnapshot(reply.snapshot);
      this.time(reply);
      this.lease = lease;
      this.closing = false;
      this.status("saved");
      return { snapshot, serverNow: reply.serverNow };
    } catch (error) {
      await this.transport.release(lease).catch(() => {});
      throw error;
    }
  }
  check() {
    if (this.lease && this.now() >= this.deadline) this.status("lost");
    return this.active;
  }
  queue(value: unknown) {
    if (this.closing || !this.check()) return;
    this.latest = cloudSnapshot(value);
  }
  async flush() {
    if (this.flight) return this.flight;
    if (!this.check()) return;
    this.flight = this.send().finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  private async send() {
    try {
      if (!this.pending && this.latest) {
        this.pending = { request: this.uuid(), snapshot: this.latest };
        this.latest = undefined;
      }
      if (this.pending) {
        this.status("saving");
        const reply = await this.transport.commit(
          this.lease,
          this.revision,
          this.pending.request,
          this.pending.snapshot,
        );
        if (this.state === "lost") throw new Error("SESSION_LOST");
        this.time(reply);
        this.pending = undefined;
      } else {
        const reply = await this.transport.heartbeat(this.lease);
        if (this.state === "lost") throw new Error("SESSION_LOST");
        // Heartbeat does not change the snapshot revision.
        this.time({ ...reply, revision: this.revision });
      }
      this.status("saved");
    } catch (error) {
      this.status(
        FATAL.test(String(error)) || this.now() >= this.deadline
          ? "lost"
          : "retry",
      );
      throw error;
    }
  }
  async close() {
    this.closing = true;
    if (!this.active) {
      await this.flight?.catch(() => {});
      this.lease = "";
      this.pending = undefined;
      this.latest = undefined;
      this.revision = 0;
      this.closing = false;
      return;
    }
    try {
      // An unknown commit outcome must be resolved before release or account switch.
      await this.flush();
      if (this.pending || this.latest) await this.flush();
      if (this.pending || this.latest || this.state === "lost")
        throw new Error("SESSION_LOST");
      await this.transport.release(this.lease);
      this.lease = "";
      this.closing = false;
      this.status("idle");
    } catch (error) {
      this.closing = false;
      throw error;
    }
  }
}

import type { Draft } from "@/lib/offline/drafts";
import type { SaveState } from "./CheckinStatus";

export type RemoteLog = { content: string; edited_at: string };
type SaveResult = { kind: "saved"; editedAt: string } | { kind: "conflict"; remote: RemoteLog | null };

type Options = {
  baseEditedAt: string | null;
  persist: (draft: Draft) => Promise<void> | void;
  clear: (expectedEditedAt: string) => Promise<void> | void;
  send: (value: { content: string; editedAt: string | null }) => Promise<SaveResult>;
  onState?: (state: SaveState) => void;
  onConflict?: (remote: RemoteLog | null) => void;
  onRemoteSelected?: (content: string) => void;
};

export class LogSaveQueue {
  private draft: Draft | null = null;
  private baseEditedAt: string | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private persistence = Promise.resolve();
  private busy = false;
  private ready = false;
  private dirty = false;
  private blocked = false;
  private disposed = false;
  private remote: RemoteLog | null = null;
  private lastLocalMs = 0;
  private wakeRetry: (() => void) | null = null;

  constructor(private readonly options: Options) {
    this.baseEditedAt = options.baseEditedAt;
  }

  edit(content: string): Promise<void> {
    this.lastLocalMs = Math.max(Date.now(), this.lastLocalMs + 1);
    this.draft = { content, editedAt: new Date(this.lastLocalMs).toISOString(), baseEditedAt: this.baseEditedAt };
    this.dirty = true;
    this.ready = false;
    this.blocked = false;
    this.options.onConflict?.(null);
    this.options.onState?.("saving");
    const saved = this.queuePersist(this.draft);
    this.wakeRetry?.();
    this.schedule();
    return saved;
  }

  restore(draft: Draft): Promise<void> {
    this.draft = draft;
    this.lastLocalMs = Math.max(this.lastLocalMs, Date.parse(draft.editedAt) || 0);
    this.baseEditedAt = draft.baseEditedAt ?? null;
    this.dirty = true;
    this.ready = true;
    this.options.onState?.("saving");
    void this.drain();
    return Promise.resolve();
  }

  retry(): void {
    if (!this.draft || this.disposed || this.blocked) return;
    this.dirty = true;
    this.ready = true;
    this.options.onState?.("saving");
    void this.drain();
  }

  keepLocal(): void {
    if (!this.blocked || !this.draft) return;
    this.baseEditedAt = this.remote?.edited_at ?? null;
    this.draft = { ...this.draft, baseEditedAt: this.baseEditedAt };
    this.blocked = false;
    this.options.onConflict?.(null);
    void this.queuePersist(this.draft);
    this.retry();
  }

  async keepRemote(): Promise<void> {
    if (!this.blocked || !this.draft) return;
    const revision = this.draft.editedAt;
    const content = this.remote?.content ?? "";
    this.baseEditedAt = this.remote?.edited_at ?? null;
    this.blocked = false;
    this.dirty = false;
    this.draft = null;
    this.options.onRemoteSelected?.(content);
    this.options.onConflict?.(null);
    try { await this.persistence; await this.options.clear(revision); if (!this.draft && !this.disposed) this.options.onState?.("saved"); }
    catch { this.options.onState?.("failed"); }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.wakeRetry?.();
  }

  private queuePersist(draft: Draft): Promise<void> {
    this.persistence = this.persistence.then(() => this.options.persist(draft)).catch(() => { this.options.onState?.("failed"); });
    return this.persistence;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.ready = true;
      void this.drain();
    }, 600);
  }

  private async drain(): Promise<void> {
    if (this.busy || !this.ready || this.blocked || this.disposed) return;
    this.busy = true;
    try {
      while (this.dirty && this.ready && !this.blocked && !this.disposed) {
        const draft = this.draft;
        if (!draft) break;
        this.dirty = false;
        await this.persistence;
        let retries = 0;
        while (!this.disposed) {
          if (this.draft !== draft) break;
          try {
            const result = await this.options.send({ content: draft.content, editedAt: this.baseEditedAt });
            if (result.kind === "conflict") {
              this.remote = result.remote;
              this.blocked = true;
              this.options.onConflict?.(result.remote);
              this.options.onState?.("conflict");
              break;
            }
            this.baseEditedAt = result.editedAt;
            if (this.draft === draft) {
              await this.options.clear(draft.editedAt);
              if (this.draft === draft && !this.disposed) { this.draft = null; this.options.onState?.("saved"); }
            } else if (this.draft) {
              this.draft = { ...this.draft, baseEditedAt: result.editedAt };
              await this.queuePersist(this.draft);
            }
            break;
          } catch {
            if (this.draft !== draft) break;
            if (retries === 4) { this.options.onState?.("failed"); break; }
            await this.waitForRetry([1000, 2000, 4000, 8000][retries++]);
          }
        }
      }
    } finally {
      this.busy = false;
      if (this.dirty && this.ready && !this.blocked && !this.disposed) void this.drain();
    }
  }

  private waitForRetry(delay: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); this.wakeRetry = null; resolve(); };
      const timer = setTimeout(finish, delay);
      this.wakeRetry = finish;
    });
  }
}

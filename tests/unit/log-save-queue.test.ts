import { afterEach, describe, expect, it, vi } from "vitest";
import { LogSaveQueue } from "@/components/checkin/log-save-queue";
import type { Draft } from "@/lib/offline/drafts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("log save queue", () => {
  it("never resends discarded local text after choosing the remote version", async () => {
    const send = vi.fn().mockResolvedValue({ kind: "conflict", remote: { content: "keep me", edited_at: "remote" } });
    const queue = new LogSaveQueue({ baseEditedAt: "old", persist: vi.fn(), clear: vi.fn(), send });
    await queue.restore({ content: "discard me", editedAt: "local", baseEditedAt: "old" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await queue.keepRemote();
    queue.retry();
    await Promise.resolve(); await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    queue.dispose();
  });
  afterEach(() => vi.useRealTimers());

  it("serializes requests and sends the latest edit with the confirmed base", async () => {
    vi.useFakeTimers();
    const first = deferred<{ kind: "saved"; editedAt: string }>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ kind: "saved", editedAt: "remote-2" });
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear: vi.fn(), send });
    await queue.edit("first");
    await vi.advanceTimersByTimeAsync(600);
    await queue.edit("second");
    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve({ kind: "saved", editedAt: "remote-1" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toEqual({ content: "second", editedAt: "remote-1" });
    queue.dispose();
  });

  it("skips retrying a stale failed value when a newer edit is pending", async () => {
    vi.useFakeTimers();
    const first = deferred<{ kind: "saved"; editedAt: string }>();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ kind: "saved", editedAt: "remote-1" });
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear: vi.fn(), send });
    await queue.edit("old"); await vi.advanceTimersByTimeAsync(600);
    await queue.edit("new"); await vi.advanceTimersByTimeAsync(600);
    first.reject(new Error("offline"));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0].content).toBe("new");
    queue.dispose();
  });

  it("restores a persisted base and immediately retries the draft", async () => {
    const send = vi.fn().mockResolvedValue({ kind: "saved", editedAt: "remote-2" });
    const queue = new LogSaveQueue({ baseEditedAt: "server-newer", persist: vi.fn(), clear: vi.fn(), send });
    const draft: Draft = { content: "recovered", editedAt: "2026-09-22T01:00:00.000Z", baseEditedAt: "server-old" };
    await queue.restore(draft);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ content: "recovered", editedAt: "server-old" }));
    queue.dispose();
  });

  it("offers both versions on conflict and saves local using the remote base", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValueOnce({ kind: "conflict", remote: { content: "remote text", edited_at: "remote-1" } }).mockResolvedValue({ kind: "saved", editedAt: "remote-2" });
    const onConflict = vi.fn();
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear: vi.fn(), send, onConflict });
    await queue.edit("local text"); await vi.advanceTimersByTimeAsync(600);
    expect(onConflict).toHaveBeenCalledWith({ content: "remote text", edited_at: "remote-1" });
    queue.keepLocal();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toEqual({ content: "local text", editedAt: "remote-1" });
    queue.dispose();
  });

  it("allows a manual retry after all automatic attempts fail", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const onState = vi.fn();
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear: vi.fn(), send, onState });
    await queue.edit("still here");
    await vi.advanceTimersByTimeAsync(15600);
    expect(send).toHaveBeenCalledTimes(5);
    expect(onState).toHaveBeenLastCalledWith("failed");
    send.mockResolvedValueOnce({ kind: "saved", editedAt: "remote-1" });
    queue.retry();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(6));
    expect(send.mock.calls[5][0].content).toBe("still here");
    queue.dispose();
  });

  it("does not report an older save as current while its draft cleanup is pending", async () => {
    vi.useFakeTimers();
    const clearing = deferred<void>();
    const second = deferred<{ kind: "saved"; editedAt: string }>();
    const clear = vi.fn().mockReturnValueOnce(clearing.promise).mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValueOnce({ kind: "saved", editedAt: "remote-1" }).mockReturnValueOnce(second.promise);
    const onState = vi.fn();
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear, send, onState });
    await queue.edit("first"); await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await queue.edit("second"); await vi.advanceTimersByTimeAsync(600);
    clearing.resolve();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toEqual({ content: "second", editedAt: "remote-1" });
    expect(onState).toHaveBeenLastCalledWith("saving");
    second.resolve({ kind: "saved", editedAt: "remote-2" });
    queue.dispose();
  });

  it("interrupts an old retry delay after a fresh debounced edit", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ kind: "saved", editedAt: "remote-1" });
    const queue = new LogSaveQueue({ baseEditedAt: null, persist: vi.fn(), clear: vi.fn(), send });
    await queue.edit("old"); await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1);
    await queue.edit("new"); await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].content).toBe("new");
    queue.dispose();
  });
});

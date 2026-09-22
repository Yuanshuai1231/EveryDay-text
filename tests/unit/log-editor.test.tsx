import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { LogEditor } from "@/components/checkin/LogEditor";
import { loadDraft, saveDraft, clearDraft } from "@/lib/offline/drafts";

vi.mock("@/lib/offline/drafts", () => ({ loadDraft: vi.fn(), saveDraft: vi.fn(), clearDraft: vi.fn() }));

const props = { spaceId: "space-a", memberId: "member-a", date: "2026-09-22", slot: "morning" as const, initialContent: "server", editedAt: "server-1" };

describe("log editor", () => {
  beforeEach(() => {
    vi.mocked(saveDraft).mockResolvedValue();
    vi.mocked(clearDraft).mockResolvedValue();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("does not overwrite a new edit when an old draft finishes loading", async () => {
    let resolve!: (value: { content: string; editedAt: string; baseEditedAt: string }) => void;
    vi.mocked(loadDraft).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<LogEditor {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "just typed" } });
    await act(async () => resolve({ content: "old draft", editedAt: "2026-09-22T01:00:00.000Z", baseEditedAt: "server-old" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("just typed");
    expect(saveDraft).toHaveBeenCalledWith("space-a", "member-a", "2026-09-22", "morning", expect.objectContaining({ content: "just typed", baseEditedAt: "server-1" }));
  });

  it("restores a draft's own base and immediately sends the recovered content", async () => {
    vi.mocked(loadDraft).mockResolvedValue({ content: "recovered", editedAt: "2026-09-22T01:00:00.000Z", baseEditedAt: "server-old" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ log: { edited_at: "server-new" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<LogEditor {...props} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("recovered");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ content: "recovered", editedAt: "server-old" });
  });
});

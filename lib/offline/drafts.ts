export type DraftSlot = "morning" | "afternoon";
export type Draft = { content: string; editedAt: string; baseEditedAt?: string | null };

export function draftKey(spaceId: string, memberId: string, workDate: string, slot: DraftSlot): string {
  return `${spaceId}:${memberId}:${workDate}:${slot}`;
}

const memory = new Map<string, Draft>();
const DB_NAME = "daily-checkin";
const STORE = "drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft database is blocked"));
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, setResult: (value: T) => void) => void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result!: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Draft transaction aborted"));
      try { operation(transaction.objectStore(STORE), (value) => { result = value; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  } finally { db.close(); }
}

export async function saveDraft(spaceId: string, memberId: string, workDate: string, slot: DraftSlot, draft: Draft): Promise<void> {
  const key = draftKey(spaceId, memberId, workDate, slot);
  if (typeof indexedDB === "undefined") { memory.set(key, draft); return; }
  await transact<void>("readwrite", (store) => { store.put(draft, key); });
}

export async function loadDraft(spaceId: string, memberId: string, workDate: string, slot: DraftSlot): Promise<Draft | null> {
  const key = draftKey(spaceId, memberId, workDate, slot);
  if (typeof indexedDB === "undefined") return memory.get(key) ?? null;
  return transact<Draft | null>("readonly", (store, setResult) => {
    const request = store.get(key);
    request.onsuccess = () => setResult((request.result as Draft | undefined) ?? null);
  });
}

export async function clearDraft(spaceId: string, memberId: string, workDate: string, slot: DraftSlot, expectedEditedAt?: string): Promise<void> {
  const key = draftKey(spaceId, memberId, workDate, slot);
  if (typeof indexedDB === "undefined") {
    if (expectedEditedAt === undefined || memory.get(key)?.editedAt === expectedEditedAt) memory.delete(key);
    return;
  }
  await transact<void>("readwrite", (store) => {
    if (expectedEditedAt === undefined) { store.delete(key); return; }
    const request = store.get(key);
    request.onsuccess = () => {
      if ((request.result as Draft | undefined)?.editedAt === expectedEditedAt) store.delete(key);
    };
  });
}

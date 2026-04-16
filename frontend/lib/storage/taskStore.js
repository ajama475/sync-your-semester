const DATABASE_NAME = "sync-your-semester";
const DATABASE_VERSION = 2;
const TASKS_STORE = "tasks";
const SYLLABI_STORE = "syllabi";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYLLABI_STORE)) {
        db.createObjectStore(SYLLABI_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function withStore(storeName, mode, callback) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let settled = false;

        tx.oncomplete = () => {
          if (!settled) resolve(undefined);
          db.close();
        };
        tx.onerror = () => { reject(tx.error); db.close(); };
        tx.onabort = () => { reject(tx.error); db.close(); };

        Promise.resolve(callback(store, tx))
          .then((value) => { settled = true; resolve(value); })
          .catch((err) => { tx.abort(); reject(err); });
      })
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listTasks() {
  const all = await withStore(TASKS_STORE, "readonly", (store) => requestToPromise(store.getAll()));
  return [...all].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function putTask(task) {
  const payload = { ...task, updatedAt: Date.now() };
  await withStore(TASKS_STORE, "readwrite", (store) => requestToPromise(store.put(payload)));
  return payload;
}

export async function patchTask(id, updater) {
  return withStore(TASKS_STORE, "readwrite", async (store) => {
    const existing = await requestToPromise(store.get(id));
    if (!existing) throw new Error(`Task "${id}" not found.`);
    const next = { ...updater(existing), id, updatedAt: Date.now() };
    await requestToPromise(store.put(next));
    return next;
  });
}

export async function deleteTask(id) {
  await withStore(TASKS_STORE, "readwrite", (store) => requestToPromise(store.delete(id)));
}

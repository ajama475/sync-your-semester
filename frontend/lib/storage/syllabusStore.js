const DATABASE_NAME = "sync-your-semester";
const DATABASE_VERSION = 2;
const SYLLABI_STORE = "syllabi";
const TASKS_STORE = "tasks";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(SYLLABI_STORE)) {
        database.createObjectStore(SYLLABI_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(TASKS_STORE)) {
        database.createObjectStore(TASKS_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function withStore(mode, callback) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(SYLLABI_STORE, mode);
        const store = transaction.objectStore(SYLLABI_STORE);

        let settled = false;

        transaction.oncomplete = () => {
          if (!settled) {
            resolve(undefined);
          }
          database.close();
        };

        transaction.onerror = () => {
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
          database.close();
        };

        transaction.onabort = () => {
          reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
          database.close();
        };

        Promise.resolve(callback(store, transaction))
          .then((value) => {
            settled = true;
            resolve(value);
          })
          .catch((error) => {
            transaction.abort();
            reject(error);
          });
      })
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function normalizeRecord(record) {
  return {
    reviewItems: [],
    parseResult: null,
    message: null,
    courseId: "",
    ...record,
  };
}

export async function listSyllabusRecords() {
  const records = await withStore("readonly", (store) => requestToPromise(store.getAll()));

  return [...records]
    .map(normalizeRecord)
    .sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0));
}

export async function getSyllabusRecord(id) {
  const record = await withStore("readonly", (store) => requestToPromise(store.get(id)));
  return record ? normalizeRecord(record) : null;
}

export async function putSyllabusRecord(record) {
  const payload = normalizeRecord({
    ...record,
    updatedAt: Date.now(),
  });

  await withStore("readwrite", (store) => requestToPromise(store.put(payload)));
  return payload;
}

export async function patchSyllabusRecord(id, updater) {
  return withStore("readwrite", async (store) => {
    const existing = await requestToPromise(store.get(id));

    if (!existing) {
      throw new Error(`Syllabus record "${id}" was not found.`);
    }

    const nextRecord = normalizeRecord({
      ...updater(normalizeRecord(existing)),
      id,
      updatedAt: Date.now(),
    });

    await requestToPromise(store.put(nextRecord));
    return nextRecord;
  });
}

export async function deleteSyllabusRecord(id) {
  await withStore("readwrite", (store) => requestToPromise(store.delete(id)));
}

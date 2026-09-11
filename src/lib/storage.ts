import type { CasePackage, ReviewRecord } from '../types';

const DB_NAME = 'a11y-audit-console';
const DB_VERSION = 1;
const STORE_CASES = 'cases';
const STORE_REVIEWS = 'reviews';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CASES)) {
        db.createObjectStore(STORE_CASES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
        const s = db.createObjectStore(STORE_REVIEWS, { keyPath: 'id' });
        s.createIndex('caseId', 'caseId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[]
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s) as IDBRequest<T>;
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function saveCasePackage(pkg: CasePackage): Promise<void> {
  await tx(STORE_CASES, 'readwrite', (s) => s.put(pkg) as IDBRequest);
}

export async function listCasePackages(): Promise<CasePackage[]> {
  return tx(STORE_CASES, 'readonly', (s) => s.getAll() as IDBRequest<CasePackage[]>);
}

export async function deleteCasePackage(id: string): Promise<void> {
  await tx(STORE_CASES, 'readwrite', (s) => s.delete(id) as IDBRequest);
}

export async function saveReview(record: ReviewRecord): Promise<void> {
  await tx(STORE_REVIEWS, 'readwrite', (s) => s.put(record) as IDBRequest);
}

export async function listReviews(caseId?: string): Promise<ReviewRecord[]> {
  if (!caseId) {
    return tx(STORE_REVIEWS, 'readonly', (s) => s.getAll() as IDBRequest<ReviewRecord[]>);
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_REVIEWS, 'readonly');
    const idx = t.objectStore(STORE_REVIEWS).index('caseId');
    const req = idx.getAll(caseId);
    req.onsuccess = () => resolve(req.result as ReviewRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteReview(id: string): Promise<void> {
  await tx(STORE_REVIEWS, 'readwrite', (s) => s.delete(id) as IDBRequest);
}

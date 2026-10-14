/**
 * Atlas High-Capacity Hybrid Storage Engine
 * 
 * Solves the browser "maximum size reached" / QuotaExceededError (5MB localStorage limit)
 * by combining:
 * 1. IndexedDB: High-capacity browser storage (handles gigabytes of streams, users, games).
 * 2. In-Memory Cache: Sub-millisecond reads.
 * 3. Safe LocalStorage Fallback: Gracefully handles storage quotas with automatic pruning.
 */

const DB_NAME = 'AtlasHighCapacityDB';
const DB_VERSION = 1;
const STORE_NAME = 'atlas_store';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryCache = new Map<string, string>();

/**
 * Initializes and retrieves the IndexedDB instance
 */
function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB initialization failed:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * High-capacity asynchronous storage API (IndexedDB backed)
 */
export const atlasStorage = {
  async setItem(key: string, value: string): Promise<void> {
    memoryCache.set(key, value);

    // Also mirror to safeLocalStorage for instant synchronous boot if small enough
    if (value.length < 50000) {
      safeLocalStorage.setItem(key, value);
    } else {
      // If oversized, remove from localStorage to free up browser quota!
      safeLocalStorage.removeItem(key);
    }

    const db = await getIDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  async getItem(key: string): Promise<string | null> {
    if (memoryCache.has(key)) {
      return memoryCache.get(key) || null;
    }

    // Check synchronous safe storage first
    const localVal = safeLocalStorage.getItem(key);
    if (localVal !== null) {
      memoryCache.set(key, localVal);
      return localVal;
    }

    const db = await getIDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const result = req.result as string | undefined;
          if (result) {
            memoryCache.set(key, result);
            resolve(result);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  async removeItem(key: string): Promise<void> {
    memoryCache.delete(key);
    safeLocalStorage.removeItem(key);

    const db = await getIDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  /**
   * Synchronous read helper (from memoryCache or safeLocalStorage)
   */
  getItemSync(key: string): string | null {
    if (memoryCache.has(key)) {
      return memoryCache.get(key) || null;
    }
    return safeLocalStorage.getItem(key);
  },

  /**
   * Synchronous write helper with automatic memory & background IndexedDB persistence
   */
  setItemSync(key: string, value: string): void {
    memoryCache.set(key, value);
    if (value.length < 50000) {
      safeLocalStorage.setItem(key, value);
    } else {
      safeLocalStorage.removeItem(key);
    }
    this.setItem(key, value).catch(() => null);
  },
};

/**
 * Quota-Safe LocalStorage wrapper that catches and mitigates QuotaExceededError
 */
export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): boolean {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e: any) {
      console.warn('LocalStorage quota warning, performing auto-prune:', e);
      // Auto-prune oversized keys to recover space
      this.autoPruneStorage();

      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.warn('LocalStorage write skipped after prune (data safely in memory/IDB):', retryErr);
        return false;
      }
    }
  },

  removeItem(key: string): void {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },

  clear(): void {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  },

  /**
   * Automatically clears oversized cache entries (like old cached base64 avatars)
   * while preserving user session and cloaking configuration.
   */
  autoPruneStorage(): void {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
      const keysToPrune: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && !k.includes('session') && !k.includes('cloak') && !k.includes('sound')) {
          const val = window.localStorage.getItem(k);
          // If value is over 10KB, mark for removal from localStorage (IndexedDB has it)
          if (val && val.length > 10000) {
            keysToPrune.push(k);
          }
        }
      }
      for (const k of keysToPrune) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
  },
};

// Immediate auto-prune upon loading to clear any legacy storage overflows
if (typeof window !== 'undefined') {
  try {
    safeLocalStorage.autoPruneStorage();
  } catch {
    // ignore
  }
}

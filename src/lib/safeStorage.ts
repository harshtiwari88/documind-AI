// Bulletproof storage utility that gracefully falls back to in-memory storage
// when localStorage is restricted, disabled, or throws SecurityError in cross-origin iframes
const memoryStore = new Map<string, string>();

let isStorageWorking = false;
try {
  if (typeof window !== "undefined" && "localStorage" in window && window.localStorage !== null) {
    const testKey = "__harsh_ai_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    isStorageWorking = true;
  }
} catch {
  isStorageWorking = false;
}

export const safeStorage = {
  getItem(key: string): string | null {
    if (isStorageWorking) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        isStorageWorking = false;
      }
    }
    return memoryStore.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (isStorageWorking) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        isStorageWorking = false;
      }
    }
    memoryStore.set(key, String(value));
  },

  removeItem(key: string): void {
    if (isStorageWorking) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        isStorageWorking = false;
      }
    }
    memoryStore.delete(key);
  },

  clear(): void {
    if (isStorageWorking) {
      try {
        window.localStorage.clear();
      } catch {
        isStorageWorking = false;
      }
    }
    memoryStore.clear();
  },
};

export default safeStorage;

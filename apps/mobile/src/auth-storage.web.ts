const memoryStorage = new Map<string, string>();

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const authStorage = {
  async getItem(key: string) {
    return browserStorage()?.getItem(key) ?? memoryStorage.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    const storage = browserStorage();
    if (storage) storage.setItem(key, value);
    else memoryStorage.set(key, value);
  },
  async deleteItem(key: string) {
    const storage = browserStorage();
    if (storage) storage.removeItem(key);
    memoryStorage.delete(key);
  },
};

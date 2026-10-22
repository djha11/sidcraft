export const preferencesStorage = {
  async get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing can disable storage; settings remain active for this session.
    }
  },
};

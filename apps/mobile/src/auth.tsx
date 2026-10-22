import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { authStorage } from "./auth-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
declare const process: { env: Record<string, string | undefined> };

const KEY = "pulse.refresh-token";
const STORAGE_TIMEOUT_MS = 5_000;

type AuthContextValue = {
  accessToken: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(
    displayName: string,
    username: string,
    email: string,
    password: string,
    otp: string,
  ): Promise<void>;
  logout(): Promise<void>;
};

const Context = createContext<AuthContextValue | null>(null);

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("SECURE_STORAGE_TIMED_OUT")),
      timeoutMs,
    );
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const refreshToken = await withTimeout(
          authStorage.getItem(KEY),
          STORAGE_TIMEOUT_MS,
        );
        if (!refreshToken) return;

        try {
          const result = await api.refresh(refreshToken);
          if (mounted) setAccessToken(result.accessToken);
          await authStorage.setItem(KEY, result.refreshToken);
        } catch {
          await authStorage.deleteItem(KEY).catch(() => undefined);
        }
      } catch {
        // A storage failure must not trap the user on the startup spinner.
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync("social", {
            name: "Social activity",
            importance: Notifications.AndroidImportance.HIGH,
          });
        const permission = await Notifications.requestPermissionsAsync();
        const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
        if (permission.status === "granted" && projectId) {
          const push = await Notifications.getExpoPushTokenAsync({ projectId });
          await api.registerPushToken(
            push.data,
            Platform.OS === "ios" ? "ios" : "android",
            accessToken,
          );
        }
      } catch {
        /* The in-app inbox remains available when native push registration is unavailable. */
      }
    })();
    const refreshAccessToken = async () => {
      const refreshToken = await authStorage.getItem(KEY);
      if (!refreshToken) return;
      try {
        const result = await api.refresh(refreshToken);
        setAccessToken(result.accessToken);
        await authStorage.setItem(KEY, result.refreshToken);
      } catch {
        await authStorage.deleteItem(KEY).catch(() => undefined);
        setAccessToken(null);
      }
    };
    const interval = setInterval(
      () => void refreshAccessToken(),
      12 * 60 * 1_000,
    );
    return () => clearInterval(interval);
  }, [accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      loading,
      login: async (email, password) => {
        const result = await api.login({ email, password });
        setAccessToken(result.accessToken);
        await authStorage.setItem(KEY, result.refreshToken);
      },
      register: async (displayName, username, email, password, otp) => {
        const result = await api.register({
          displayName,
          username,
          otp,
          email,
          password,
          acceptedTerms: true,
        });
        setAccessToken(result.accessToken);
        await authStorage.setItem(KEY, result.refreshToken);
      },
      logout: async () => {
        const token = await authStorage.getItem(KEY);
        if (token) await api.logout(token).catch(() => undefined);
        await authStorage.deleteItem(KEY);
        setAccessToken(null);
      },
    }),
    [accessToken, loading],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}

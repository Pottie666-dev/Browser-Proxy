import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  setAuthTokenGetter,
  setAuthFailureHandler,
} from "@workspace/api-client-react";
import { getApiBaseUrl } from "./api-url";

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
};
let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;
let epoch = 0;
let persistence: Promise<void> = Promise.resolve();
const subscribers = new Set<(value: Session | null) => void>();
const key = "browser-proxy-auth-v1";
class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function save(value: Session | null) {
  const generation = ++epoch;
  session = value;
  // Serialize keychain writes so an older refresh cannot overwrite a later logout/login.
  const write = persistence
    .catch(() => {})
    .then(async () => {
      if (Platform.OS !== "web") {
        if (value)
          await SecureStore.setItemAsync(key, JSON.stringify(value), {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        else await SecureStore.deleteItemAsync(key);
      }
    });
  persistence = write;
  try {
    await write;
  } finally {
    if (generation === epoch)
      for (const subscriber of subscribers) subscriber(value);
  }
}
async function exchange(path: string, body: unknown): Promise<Session> {
  const base = getApiBaseUrl();
  if (
    !base.startsWith("https://") &&
    !(
      __DEV__ &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)
    )
  )
    throw new Error("Configure a secure HTTPS API before signing in");
  const response = await fetch(`${base}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new AuthError(
      response.status,
      response.status === 401
        ? "Invalid credentials or expired session"
        : response.status === 403
          ? "Registration is disabled by the server"
          : "Authentication request failed",
    );
  return response.json();
}
export async function accessToken(): Promise<string | null> {
  if (!session) return null;
  if (Date.parse(session.expiresAt) > Date.now() + 60000)
    return session.accessToken;
  if (!refreshing) {
    const original = session;
    const generation = epoch;
    refreshing = (async () => {
      try {
        const next = await exchange("refresh", {
          refreshToken: original.refreshToken,
        });
        if (generation !== epoch) return session;
        await save(next);
        return next;
      } catch (error) {
        if (
          generation === epoch &&
          error instanceof AuthError &&
          [400, 401].includes(error.status)
        ) {
          await save(null);
          return null;
        }
        throw error;
      } finally {
        refreshing = null;
      }
    })();
  }
  return (await refreshing)?.accessToken ?? null;
}
setAuthTokenGetter(accessToken);
setAuthFailureHandler(() => save(null));
export async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
) {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to continue");
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 401) {
    await save(null);
    throw new Error("Session expired");
  }
  if (!response.ok) throw new Error("Request failed");
  return response;
}
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  signIn(email: string, password: string, register?: boolean): Promise<void>;
  signOut(): Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queries = useQueryClient();
  const user = useRef(session?.userId);
  const [current, setCurrent] = useState<Session | null>(session);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const onChange = (value: Session | null) => {
      if (user.current !== value?.userId) queries.clear();
      user.current = value?.userId;
      setCurrent(value);
    };
    subscribers.add(onChange);
    (async () => {
      try {
        if (Platform.OS !== "web") {
          const stored = await SecureStore.getItemAsync(key);
          if (stored) session = JSON.parse(stored);
        }
        if (session) await accessToken();
        setCurrent(session);
      } catch (error) {
        if (
          error instanceof SyntaxError ||
          (error instanceof AuthError && [400, 401].includes(error.status))
        )
          await save(null);
        setCurrent(session);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      subscribers.delete(onChange);
    };
  }, [queries]);
  return (
    <AuthContext.Provider
      value={{
        session: current,
        loading,
        async signIn(email, password, register = false) {
          await save(
            await exchange(register ? "register" : "login", {
              email,
              password,
            }),
          );
        },
        async signOut() {
          try {
            if (session)
              await authenticatedFetch("/api/auth/logout", { method: "POST" });
          } finally {
            await save(null);
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}

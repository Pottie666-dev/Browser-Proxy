import Constants from "expo-constants";
import { validatePublicApiOrigin } from "./api-origin";
let runtimeOrigin: string | null = null;
export function setRuntimeApiOrigin(value: string) {
  runtimeOrigin = validatePublicApiOrigin(value);
}

/** Explicit API settings win; development devices can use Metro's LAN host. */
export function getApiBaseUrl(): string {
  if (runtimeOrigin) return runtimeOrigin;
  const configured =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (configured) {
    return (
      /^https?:\/\//i.test(configured) ? configured : `https://${configured}`
    ).replace(/\/+$/, "");
  }
  if (__DEV__ && Constants.expoConfig?.hostUri) {
    const host = new URL(`http://${Constants.expoConfig.hostUri}`).hostname;
    return `http://${host}:3000`;
  }
  // Local development fallback only. Production builds must set an API URL.
  return __DEV__ ? "http://localhost:3000" : "https://api.example.invalid";
}

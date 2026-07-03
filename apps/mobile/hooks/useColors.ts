import { useColorScheme } from "react-native";

const lightColors = {
  text: "#111827",
  background: "#f8fafc",
  tint: "#2563eb",
  tabIconDefault: "#94a3b8",
  tabIconSelected: "#2563eb",
  border: "#e5e7eb",
  card: "#ffffff",

  foreground: "#111827",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  primary: "#2563eb",
  primaryForeground: "#ffffff",
  destructive: "#dc2626",
};

const darkColors = {
  text: "#f8fafc",
  background: "#020617",
  tint: "#60a5fa",
  tabIconDefault: "#64748b",
  tabIconSelected: "#60a5fa",
  border: "#1e293b",
  card: "#0f172a",

  foreground: "#f8fafc",
  muted: "#1e293b",
  mutedForeground: "#94a3b8",
  primary: "#60a5fa",
  primaryForeground: "#020617",
  destructive: "#f87171",
};

export type AppColors = typeof lightColors;

export function useColors(): AppColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

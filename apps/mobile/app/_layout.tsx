import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";

const rawApiDomain =
  process.env.EXPO_PUBLIC_API_URL?.trim() ??
  process.env.EXPO_PUBLIC_DOMAIN?.trim();

setBaseUrl(
  rawApiDomain
    ? rawApiDomain.startsWith("http://") || rawApiDomain.startsWith("https://")
      ? rawApiDomain.replace(/\/+$/, "")
      : `https://${rawApiDomain.replace(/\/+$/, "")}`
    : "http://192.168.0.8:3000"
);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="account-form"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="browser" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        // Load Feather from a local asset — avoids pnpm symlink resolution issues in Metro
        await Font.loadAsync({
          Feather: require("../assets/fonts/Feather.ttf"),
        });
      } catch {
        // Non-fatal: icons will degrade gracefully
      }
      try {
        // Load Inter from Google Fonts CDN — can fail on slow/no network
        await Font.loadAsync({
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
        });
      } catch {
        // Non-fatal: fall back to system font
      }
      setAppReady(true);
      await SplashScreen.hideAsync();
    }
    loadFonts();
  }, []);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebView } = require("react-native-webview") as { WebView: React.ComponentType<any> };
import type { WebViewNavigation } from "react-native-webview";

import { useColors } from "@/hooks/useColors";
import { buildFingerprintScript, buildFormInterceptScript } from "@/lib/fingerprint";

const DEFAULT_URL = "https://www.google.com";

function getApiBaseUrl(): string {
  const rawBase = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!rawBase) return "";
  return rawBase.startsWith("http://") || rawBase.startsWith("https://")
    ? rawBase.replace(/\/+$/, "")
    : `https://${rawBase.replace(/\/+$/, "")}`;
}

function buildProxyUrl(targetUrl: string, accountId: string): string {
  const base = getApiBaseUrl();
  let cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = "https://" + cleanUrl;
  }
  const path = `/api/proxy?url=${encodeURIComponent(cleanUrl)}&accountId=${encodeURIComponent(accountId)}`;
  return base ? `${base}${path}` : path;
}

function extractTargetUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    const embedded = u.searchParams.get("url");
    return embedded ?? proxyUrl;
  } catch {
    return proxyUrl;
  }
}

function CopyItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <View style={debugStyles.row}>
      <Text style={[debugStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[debugStyles.value, { color: colors.foreground }, mono && { fontFamily: "Inter_400Regular", fontSize: 10 }]}
        numberOfLines={3}
      >
        {value}
      </Text>
      <TouchableOpacity
        onPress={handleCopy}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[debugStyles.copyBtn, { backgroundColor: copied ? colors.primary + "25" : colors.muted }]}
      >
        <Feather name={copied ? "check" : "copy"} size={12} color={copied ? colors.primary : colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 7 },
  label: { width: 68, fontSize: 11, fontFamily: "Inter_500Medium", paddingTop: 1 },
  value: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  copyBtn: {
    width: 26, height: 26, borderRadius: 6,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
});

export default function BrowserScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);

  const params = useLocalSearchParams<{
    accountId: string;
    accountEmail?: string;
    accountName?: string;
    deviceName?: string;
    userAgent?: string;
    fakeIp?: string;
    image1?: string;
    image2?: string;
  }>();

  const accountId = params.accountId ?? "";
  const accountEmail = params.accountEmail ?? "Account";
  const accountName = params.accountName ?? accountEmail;
  const deviceName = params.deviceName ?? "Unknown device";
  const userAgent = params.userAgent ?? "";
  const fakeIp = params.fakeIp ?? "";
  const image1 = params.image1 || null;
  const image2 = params.image2 || null;

  const [addressBarText, setAddressBarText] = useState(DEFAULT_URL);
  const [currentProxyUrl, setCurrentProxyUrl] = useState(buildProxyUrl(DEFAULT_URL, accountId));
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  function navigate(input: string) {
    setIsEditing(false);
    setShowDebug(false);
    let url = input.trim();
    const looksLikeUrl = /^https?:\/\//i.test(url) || /^[\w-]+\.[\w.-]+(\/|$)/i.test(url);
    if (!looksLikeUrl || url.includes(" ")) {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    } else if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    const proxyUrl = buildProxyUrl(url, accountId);
    setAddressBarText(url);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentProxyUrl(proxyUrl);
  }

  const onNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      if (navState.url && !isEditing) {
        const target = extractTargetUrl(navState.url);
        if (target && target !== currentProxyUrl) {
          setAddressBarText(target);
        }
      }
    },
    [isEditing, currentProxyUrl]
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      const { url } = request;
      if (!url) return true;

      // Already a valid proxy URL — let it through
      if (url.includes("/api/proxy?url=") && url.includes("accountId=")) return true;

      // Malformed proxy URL (e.g. GET form stripped our params) — block silently
      if (url.includes("/api/proxy")) return false;

      // Any plain HTTP/HTTPS URL — wrap it in the proxy.
      // Use injectJavaScript to navigate imperatively so we don't update the
      // source prop — that would re-mount the WebView and cause a reload loop
      // every time Google's JS does an internal redirect.
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const proxyUrl = buildProxyUrl(url, accountId);
        setAddressBarText(url);
        setTimeout(() => setCurrentProxyUrl(proxyUrl), 0);
        return false;
      }

      return true;
    },
    [accountId]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Toolbar */}
      <View
        style={[
          styles.toolbar,
          { paddingTop: topInset + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.toolbarRow}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            onPress={() => { router.back(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>

          <View style={[styles.addressBar, { backgroundColor: colors.muted, borderColor: isEditing ? colors.primary : "transparent" }]}>
            {!isEditing && (
              <Feather name="lock" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />
            )}
            <TextInput
              style={[styles.addressInput, { color: colors.foreground }]}
              value={addressBarText}
              onChangeText={setAddressBarText}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
              onSubmitEditing={() => navigate(addressBarText)}
              placeholder="Enter URL"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              selectTextOnFocus
            />
            {isLoading && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            onPress={() => webViewRef.current?.reload()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="refresh-cw" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => webViewRef.current?.goBack()}
            disabled={!canGoBack}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="chevron-left" size={22} color={canGoBack ? colors.foreground : colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => webViewRef.current?.goForward()}
            disabled={!canGoForward}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="chevron-right" size={22} color={canGoForward ? colors.foreground : colors.mutedForeground} />
          </TouchableOpacity>

          <View style={styles.accountBadge}>
            <Feather name="user" size={12} color={colors.primary} />
            <Text style={[styles.accountLabel, { color: colors.primary }]} numberOfLines={1}>
              {accountName}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => navigate(DEFAULT_URL)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="home" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowDebug((v) => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[
              styles.debugToggle,
              { backgroundColor: showDebug ? colors.primary + "20" : colors.muted },
            ]}
          >
            <Feather
              name="shield"
              size={14}
              color={showDebug ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View
            style={[
              styles.progressBar,
              { backgroundColor: colors.primary, width: `${loadingProgress * 100}%` as `${number}%` },
            ]}
          />
        )}
      </View>

      {/* Debug panel */}
      {showDebug && (
        <View style={[styles.debugPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.debugHeader}>
            <Feather name="shield" size={14} color={colors.primary} />
            <Text style={[styles.debugTitle, { color: colors.primary }]}>Request Identity</Text>
            <Pressable onPress={() => setShowDebug(false)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView style={styles.debugScroll} showsVerticalScrollIndicator={false}>
            <CopyItem label="Account" value={accountEmail} />
            <View style={[styles.debugDivider, { backgroundColor: colors.border }]} />
            <CopyItem label="Device" value={deviceName} />
            <View style={[styles.debugDivider, { backgroundColor: colors.border }]} />
            <CopyItem label="Fake IP" value={fakeIp} mono />
            <View style={[styles.debugDivider, { backgroundColor: colors.border }]} />
            <CopyItem label="User-Agent" value={userAgent} mono />
            <View style={[styles.debugDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.locationRow, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <Feather name="map-pin" size={13} color={colors.primary} />
              <Text style={[styles.locationText, { color: colors.primary }]}>
                Location shown to sites is based on the <Text style={{ fontFamily: "Inter_600SemiBold" }}>server's IP</Text> — not your device. Your real location and IP are hidden.
              </Text>
            </View>
            <View style={[styles.locationRow, { backgroundColor: colors.muted, marginTop: 6 }]}>
              <Feather name="alert-triangle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.locationText, { color: colors.mutedForeground }]}>
                Browser JS geolocation prompts still use your device GPS. Deny them to stay private.
              </Text>
            </View>

            {(image1 || image2) && (
              <View style={styles.debugImagesSection}>
                <Text style={[styles.debugImagesLabel, { color: colors.mutedForeground }]}>STORED IMAGES</Text>
                <Text style={[styles.debugImagesHint, { color: colors.mutedForeground }]}>
                  Long-press an image to save to camera roll, or use them as reference when uploading to forms.
                </Text>
                <View style={styles.debugImagesRow}>
                  {image1 ? (
                    <View style={styles.debugThumbWrap}>
                      <Image source={{ uri: image1 }} style={[styles.debugThumb, { borderColor: colors.border }]} contentFit="cover" />
                      <Text style={[styles.debugThumbLabel, { color: colors.mutedForeground }]}>Image 1</Text>
                    </View>
                  ) : null}
                  {image2 ? (
                    <View style={styles.debugThumbWrap}>
                      <Image source={{ uri: image2 }} style={[styles.debugThumb, { borderColor: colors.border }]} contentFit="cover" />
                      <Text style={[styles.debugThumbLabel, { color: colors.mutedForeground }]}>Image 2</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* WebView or web fallback */}
      {Platform.OS === "web" ? (
        <View style={[styles.webFallback, { backgroundColor: colors.muted }]}>
          <Feather name="smartphone" size={40} color={colors.mutedForeground} />
          <Text style={[styles.webFallbackTitle, { color: colors.foreground }]}>Use on mobile</Text>
          <Text style={[styles.webFallbackText, { color: colors.mutedForeground }]}>
            The browser is available on iOS and Android. Scan the QR code to open in Expo Go.
          </Text>
          {userAgent ? (
            <View style={[styles.debugPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shield" size={12} color={colors.primary} />
              <Text style={[styles.debugPillText, { color: colors.mutedForeground }]} numberOfLines={2}>
                {deviceName} · {fakeIp}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: currentProxyUrl }}
          style={styles.webView}
          userAgent={userAgent || undefined}
          injectedJavaScriptBeforeContentLoaded={buildFingerprintScript(accountId, deviceName, userAgent) + '\n' + buildFormInterceptScript()}
          injectedJavaScriptForMainFrameOnly={false}
          onLoadStart={() => { setIsLoading(true); setLoadingProgress(0.1); }}
          onError={({ nativeEvent }: { nativeEvent: { description?: string } }) => {
            setIsLoading(false);
            setLoadingProgress(1);
            setAddressBarText(nativeEvent.description ? `Load error: ${nativeEvent.description}` : addressBarText);
          }}
          onLoadProgress={({ nativeEvent }: { nativeEvent: { progress: number } }) => {
            setLoadingProgress(nativeEvent.progress);
          }}
          onLoadEnd={() => { setIsLoading(false); setLoadingProgress(1); }}
          onNavigationStateChange={onNavigationStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          allowsBackForwardNavigationGestures
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          contentInsetAdjustmentBehavior="never"
        />
      )}

      <View style={[styles.bottomBar, { paddingBottom: bottomInset, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={[styles.deviceInfo, { backgroundColor: colors.muted }]}>
          <Feather name="wifi" size={11} color={colors.mutedForeground} />
          <Text style={[styles.deviceInfoText, { color: colors.mutedForeground }]}>
            {fakeIp ? `${deviceName}  ·  ${fakeIp}` : "Routed via server proxy"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { borderBottomWidth: 1, paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  toolbarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  addressBar: {
    flex: 1, flexDirection: "row", alignItems: "center",
    height: 36, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1.5,
  },
  addressInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", padding: 0 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 4 },
  accountBadge: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  accountLabel: { fontSize: 12, fontFamily: "Inter_500Medium", maxWidth: 140 },
  debugToggle: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  progressBar: { position: "absolute", bottom: 0, left: 0, height: 2, borderRadius: 1 },
  debugPanel: {
    borderBottomWidth: 1,
    maxHeight: 280,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  debugHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  debugTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  debugScroll: { maxHeight: 220 },
  debugDivider: { height: 1, marginVertical: 1 },
  locationRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1,
    borderColor: "transparent", marginTop: 4,
  },
  locationText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  webView: { flex: 1 },
  webFallback: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 12, paddingHorizontal: 40,
  },
  webFallbackTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  webFallbackText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  debugPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 8,
  },
  debugPillText: { fontSize: 11, fontFamily: "Inter_400Regular", maxWidth: 260 },
  bottomBar: {
    borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: "center",
  },
  deviceInfo: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  deviceInfoText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  debugImagesSection: { marginTop: 10, paddingTop: 10 },
  debugImagesLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 4 },
  debugImagesHint: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14, marginBottom: 8 },
  debugImagesRow: { flexDirection: "row", gap: 12 },
  debugThumbWrap: { alignItems: "center", gap: 4 },
  debugThumb: { width: 72, height: 72, borderRadius: 8, borderWidth: 1 },
  debugThumbLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
});

import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  AppState,
  Alert,
  Modal,
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
import { BrowserProfileView, type BrowserNavigationEvent, type BrowserProfileViewRef } from "../modules/browser-profile/src";

import { useColors } from "@/hooks/useColors";
import { buildFingerprintScript, buildFormInterceptScript, type FingerprintProfile } from "@/lib/fingerprint";
import { EMPTY_BROWSER_STATE, buildBrowserStateCaptureScript, buildBrowserStateClearScript, buildBrowserStateRestoreScript, type BrowserState } from "@/lib/browser-state";
import { getBrowserProfilePaths, getIsolationCapabilities, type IsolationCapability, isNativeIsolationAvailable } from "@/lib/native-isolation";
import { clearNativeBrowserProfile, getNativeProfileCapabilities, prepareNativeBrowserProfile, type NativeProfileCapabilities, type NativeProfilePaths } from "@/lib/browser-profile-native";

const DEFAULT_URL = "https://www.google.com";

type BrowserTab = {
  id: string;
  title: string;
  url: string;
};

type Bookmark = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
};

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pageTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url || "New Tab";
  }
}

function getApiBaseUrl(): string {
  const rawBase =
    process.env.EXPO_PUBLIC_API_URL?.trim() ??
    process.env.EXPO_PUBLIC_DOMAIN?.trim();

  if (!rawBase) return "http://192.168.0.8:3000";

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
  const { fingerprintTimezone, fingerprintProfileJson } = useLocalSearchParams<{ fingerprintTimezone?: string; fingerprintProfileJson?: string }>();
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
  const webViewRef = useRef<BrowserProfileViewRef>(null);

  const params = useLocalSearchParams<{
    accountId: string;
    accountEmail?: string;
    accountName?: string;
    deviceName?: string;
    userAgent?: string;
    fakeIp?: string;
    image1?: string;
    image2?: string;
    fingerprintTimezone?: string;
    fingerprintProfileJson?: string;
  }>();

  const accountId = params.accountId ?? "";
  const accountEmail = params.accountEmail ?? "Account";
  const accountName = params.accountName ?? accountEmail;
  const deviceName = params.deviceName ?? "Unknown device";
  const userAgent = params.userAgent ?? "";
  const fakeIp = params.fakeIp ?? "";
  const image1 = params.image1 || null;
  const image2 = params.image2 || null;
  const fingerprintTimezone = params.fingerprintTimezone;
  const fingerprintProfileJson = params.fingerprintProfileJson;

  const [addressBarText, setAddressBarText] = useState(DEFAULT_URL);
  const [currentProxyUrl, setCurrentProxyUrl] = useState(buildProxyUrl(DEFAULT_URL, accountId));
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: makeLocalId("tab"), title: "Google", url: DEFAULT_URL },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const storedFingerprintProfile: FingerprintProfile = (() => {
    try {
      const raw = typeof fingerprintProfileJson === "string" ? fingerprintProfileJson : "";
      return raw ? (JSON.parse(raw) as FingerprintProfile) : {};
    } catch {
      return {};
    }
  })();

  const fingerprintProfile: FingerprintProfile = {
    ...storedFingerprintProfile,
    accountId: String(accountId ?? ""),
    deviceName: String(deviceName ?? "") || storedFingerprintProfile.deviceName,
    userAgent: String(userAgent ?? "") || storedFingerprintProfile.userAgent,
    fakeIp: String(fakeIp ?? ""),
    timezone: String(fingerprintTimezone ?? "") || storedFingerprintProfile.timezone,
  };

  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [nativeProfilePaths, setNativeProfilePaths] = useState<NativeProfilePaths | null>(null);
  const [nativeCapabilities, setNativeCapabilities] = useState<NativeProfileCapabilities | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const apiBaseUrl = getApiBaseUrl();
  const browserProfilePaths = getBrowserProfilePaths(accountId);
  const isolationCapabilities = getIsolationCapabilities();
  const nativeIsolationAvailable = isNativeIsolationAvailable();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    setActiveTabId((current) => current || tabs[0]?.id || "");
  }, [tabs]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") webViewRef.current?.resume();
      else webViewRef.current?.pause();
    });
    return () => {
      subscription.remove();
      webViewRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function prepareNativeProfile() {
      if (!accountId) return;

      try {
        const [capabilities, paths] = await Promise.all([
          getNativeProfileCapabilities(),
          prepareNativeBrowserProfile(accountId),
        ]);

        if (!cancelled) {
          setNativeCapabilities(capabilities);
          setNativeProfilePaths(paths);
        }
      } catch {
        if (!cancelled) {
          setNativeCapabilities(null);
          setNativeProfilePaths(null);
        }
      }
    }

    prepareNativeProfile();

    return () => {
      cancelled = true;
    };
  }, [accountId]);



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
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTabId ? { ...tab, url, title: pageTitleFromUrl(url) } : tab,
      ),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentProxyUrl(proxyUrl);
  }

  const saveBrowserState = useCallback(async (nextState: BrowserState) => {
    if (!accountId || !apiBaseUrl) return;
    const merged: BrowserState = {
      cookies: { ...(browserState?.cookies ?? {}), ...(nextState.cookies ?? {}) },
      localStorage: { ...(browserState?.localStorage ?? {}), ...(nextState.localStorage ?? {}) },
      sessionStorage: { ...(browserState?.sessionStorage ?? {}), ...(nextState.sessionStorage ?? {}) },
      history: [
        ...(nextState.history ?? []),
        ...(browserState?.history ?? []),
      ].filter((item, index, arr) => arr.findIndex((other) => other.url === item.url && other.title === item.title) === index).slice(0, 250),
      updatedAt: new Date().toISOString(),
    };
    setBrowserState(merged);
    await fetch(`${apiBaseUrl}/api/accounts/${encodeURIComponent(accountId)}/browser-state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    }).catch(() => {});
  }, [accountId, apiBaseUrl, browserState]);

  const handleWebMessage = useCallback((event: { nativeEvent?: { data?: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent?.data ?? "");
      if (msg?.type === "BROWSER_PROXY_STATE") saveBrowserState(msg.state as BrowserState);
    } catch {}
  }, [saveBrowserState]);

  function openNewTab(url = DEFAULT_URL) {
    const tab: BrowserTab = { id: makeLocalId("tab"), title: pageTitleFromUrl(url), url };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    navigate(url);
    setMenuOpen(false);
  }

  function closeTab(id: string) {
    setTabs((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabId === id) {
        const replacement = next[next.length - 1];
        if (replacement) {
          setActiveTabId(replacement.id);
          setAddressBarText(replacement.url);
          setCurrentProxyUrl(buildProxyUrl(replacement.url, accountId));
        }
      }
      return next;
    });
  }

  function switchTab(tab: BrowserTab) {
    setActiveTabId(tab.id);
    setAddressBarText(tab.url);
    setCurrentProxyUrl(buildProxyUrl(tab.url, accountId));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function addBookmark() {
    const url = addressBarText || DEFAULT_URL;
    const bookmark: Bookmark = {
      id: makeLocalId("bookmark"),
      title: pageTitleFromUrl(url),
      url,
      createdAt: new Date().toISOString(),
    };
    setBookmarks((current) => {
      if (current.some((item) => item.url === bookmark.url)) return current;
      return [bookmark, ...current].slice(0, 100);
    });
    setMenuOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const browserStateCounts = {
    cookies: Object.keys(browserState?.cookies ?? {}).length,
    localStorage: Object.keys(browserState?.localStorage ?? {}).length,
    sessionStorage: Object.keys(browserState?.sessionStorage ?? {}).length,
    history: browserState?.history?.length ?? 0,
  };

  const resetSessionState = useCallback(async () => {
    if (!accountId || !apiBaseUrl) return;

    Alert.alert(
      "Reset Session",
      "Clear this account's cookies, storage and history? This does not delete the account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${apiBaseUrl}/api/accounts/${encodeURIComponent(accountId)}/browser-state`, {
                method: "DELETE",
              });
              await webViewRef.current?.clearProfileData();
              await clearNativeBrowserProfile(accountId);
              setBrowserState(EMPTY_BROWSER_STATE);
              webViewRef.current?.injectJavaScript(buildBrowserStateClearScript());
              webViewRef.current?.reload();
              setSessionOpen(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ],
    );
  }, [accountId, apiBaseUrl]);

  const clearCurrentPageRuntimeState = useCallback(() => {
    webViewRef.current?.injectJavaScript(buildBrowserStateClearScript());
    setBrowserState(EMPTY_BROWSER_STATE);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onNavigationStateChange = useCallback(
    (navState: BrowserNavigationEvent["nativeEvent"]) => {
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      if (navState.url && !isEditing) {
        const target = extractTargetUrl(navState.url);
        if (target && target !== currentProxyUrl) {
          setAddressBarText(target);
          setTabs((current) =>
            current.map((tab) =>
              tab.id === activeTabId ? { ...tab, url: target, title: navState.title || pageTitleFromUrl(target) } : tab,
            ),
          );
        }
      }
    },
    [isEditing, currentProxyUrl, activeTabId]
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

          <TouchableOpacity
            onPress={() => setMenuOpen(true)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.debugToggle, { backgroundColor: colors.muted }]}
          >
            <Feather name="more-horizontal" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsContent}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <Pressable
                key={tab.id}
                onPress={() => switchTab(tab)}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: active ? colors.primary + "18" : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Feather name="globe" size={11} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.tabTitle, { color: active ? colors.primary : colors.foreground }]} numberOfLines={1}>
                  {tab.title}
                </Text>
                {tabs.length > 1 ? (
                  <Pressable onPress={() => closeTab(tab.id)} hitSlop={8}>
                    <Feather name="x" size={11} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => openNewTab()} style={[styles.tabAdd, { backgroundColor: colors.muted }]}>
            <Feather name="plus" size={14} color={colors.mutedForeground} />
          </Pressable>
        </ScrollView>

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

            <View style={[styles.locationRow, { backgroundColor: nativeIsolationAvailable ? colors.primary + "10" : colors.muted, borderColor: nativeIsolationAvailable ? colors.primary + "30" : colors.border, marginTop: 6 }]}>
              <Feather name={nativeIsolationAvailable ? "check-circle" : "tool"} size={13} color={nativeIsolationAvailable ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.locationText, { color: nativeIsolationAvailable ? colors.primary : colors.mutedForeground }]}>
                Native Isolation: {nativeIsolationAvailable ? "active" : "planned for custom Android build"} - Profile {browserProfilePaths.profileId}
              </Text>
            </View>

            <View style={styles.nativeGrid}>
              {isolationCapabilities.map((cap) => (
                <View key={cap.key} style={[styles.nativeChip, { backgroundColor: cap.status === "native-ready" ? colors.primary + "12" : colors.muted, borderColor: colors.border }]}>
                  <Feather
                    name={cap.status === "native-ready" ? "check" : cap.status === "js" ? "code" : "cpu"}
                    size={10}
                    color={cap.status === "native-ready" ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.nativeChipText, { color: cap.status === "native-ready" ? colors.primary : colors.mutedForeground }]}>{cap.label}</Text>
                </View>
              ))}
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

      {/* Browser menu modal */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>Browser Tools</Text>
            <Pressable style={styles.menuRow} onPress={() => openNewTab()}>
              <Feather name="plus-square" size={17} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>New tab</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={addBookmark}>
              <Feather name="bookmark" size={17} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>Bookmark this page</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => { setHistoryOpen(true); setMenuOpen(false); }}>
              <Feather name="clock" size={17} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>History</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => { setBookmarksOpen(true); setMenuOpen(false); }}>
              <Feather name="book-open" size={17} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>Bookmarks</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => { setSessionOpen(true); setMenuOpen(false); }}>
              <Feather name="database" size={17} color={colors.primary} />
              <Text style={[styles.menuText, { color: colors.foreground }]}>Session isolation</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={[styles.drawer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: bottomInset + 12 }]}>
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, { color: colors.foreground }]}>History</Text>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView>
            {(browserState?.history ?? []).length ? (browserState?.history ?? []).map((item, index) => (
              <Pressable key={`${item.url}-${index}`} style={[styles.drawerItem, { borderBottomColor: colors.border }]} onPress={() => { setHistoryOpen(false); navigate(item.url); }}>
                <Text style={[styles.drawerItemTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title || pageTitleFromUrl(item.url)}</Text>
                <Text style={[styles.drawerItemSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.url}</Text>
              </Pressable>
            )) : (
              <Text style={[styles.drawerEmpty, { color: colors.mutedForeground }]}>No history captured yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={bookmarksOpen} transparent animationType="slide" onRequestClose={() => setBookmarksOpen(false)}>
        <View style={[styles.drawer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: bottomInset + 12 }]}>
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, { color: colors.foreground }]}>Bookmarks</Text>
            <Pressable onPress={() => setBookmarksOpen(false)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView>
            {bookmarks.length ? bookmarks.map((item) => (
              <Pressable key={item.id} style={[styles.drawerItem, { borderBottomColor: colors.border }]} onPress={() => { setBookmarksOpen(false); navigate(item.url); }}>
                <Text style={[styles.drawerItemTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.drawerItemSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.url}</Text>
              </Pressable>
            )) : (
              <Text style={[styles.drawerEmpty, { color: colors.mutedForeground }]}>No bookmarks yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Session isolation drawer */}
      <Modal visible={sessionOpen} transparent animationType="slide" onRequestClose={() => setSessionOpen(false)}>
        <View style={[styles.drawer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: bottomInset + 12 }]}>
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, { color: colors.foreground }]}>Session Isolation</Text>
            <Pressable onPress={() => setSessionOpen(false)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={[styles.sessionCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.sessionMetric}>
              <Text style={[styles.sessionMetricValue, { color: colors.foreground }]}>{browserStateCounts.cookies}</Text>
              <Text style={[styles.sessionMetricLabel, { color: colors.mutedForeground }]}>Cookies</Text>
            </View>
            <View style={styles.sessionMetric}>
              <Text style={[styles.sessionMetricValue, { color: colors.foreground }]}>{browserStateCounts.localStorage}</Text>
              <Text style={[styles.sessionMetricLabel, { color: colors.mutedForeground }]}>Local</Text>
            </View>
            <View style={styles.sessionMetric}>
              <Text style={[styles.sessionMetricValue, { color: colors.foreground }]}>{browserStateCounts.sessionStorage}</Text>
              <Text style={[styles.sessionMetricLabel, { color: colors.mutedForeground }]}>Session</Text>
            </View>
            <View style={styles.sessionMetric}>
              <Text style={[styles.sessionMetricValue, { color: colors.foreground }]}>{browserStateCounts.history}</Text>
              <Text style={[styles.sessionMetricLabel, { color: colors.mutedForeground }]}>History</Text>
            </View>
          </View>

          <Text style={[styles.sessionHelp, { color: colors.mutedForeground }]}>
            This state is saved per account. Opening another account gets its own storage and browsing history.
          </Text>

          <View style={[styles.sessionNativeBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.sessionNativeTitle, { color: colors.foreground }]}>
              Native profile: {nativeCapabilities?.available ? "active" : "fallback"}
            </Text>
            <Text style={[styles.sessionNativeText, { color: colors.mutedForeground }]} numberOfLines={2}>
              Native profile root: {nativeProfilePaths?.rootDir ?? browserProfilePaths.cookieStore}
            </Text>
          </View>

          <Pressable style={[styles.sessionButton, { backgroundColor: colors.muted, borderColor: colors.border }]} onPress={clearCurrentPageRuntimeState}>
            <Feather name="refresh-cw" size={16} color={colors.foreground} />
            <Text style={[styles.sessionButtonText, { color: colors.foreground }]}>Clear current page runtime</Text>
          </Pressable>

          <Pressable style={[styles.sessionButton, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "40" }]} onPress={resetSessionState}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.sessionButtonText, { color: colors.destructive }]}>Reset saved session</Text>
          </Pressable>
        </View>
      </Modal>

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
        <BrowserProfileView
          ref={webViewRef}
          profileId={accountId}
          url={currentProxyUrl}
          style={styles.webView}
          userAgent={userAgent || undefined}
          injectedJavaScript={buildBrowserStateRestoreScript(browserState) + '\n' + buildFingerprintScript(fingerprintProfile) + '\n' + buildFormInterceptScript() + '\n' + buildBrowserStateCaptureScript()}
          onMessage={handleWebMessage}
          onLoadingStateChange={({ nativeEvent }) => {
            setIsLoading(nativeEvent.loading);
            setLoadingProgress(nativeEvent.progress);
          }}
          onError={({ nativeEvent }) => {
            setIsLoading(false);
            setLoadingProgress(1);
            setAddressBarText(nativeEvent.description ? `Load error: ${nativeEvent.description}` : addressBarText);
          }}
          onNavigationStateChange={({ nativeEvent }) => onNavigationStateChange(nativeEvent)}
          onDownload={({ nativeEvent }) => {
            const fileName = typeof nativeEvent.fileName === "string" ? nativeEvent.fileName : "Download";
            Alert.alert("Download started", `${fileName} is being saved inside this account's profile.`);
          }}
          onPermissionRequest={() => {
            Alert.alert("Site permission blocked", "Camera, microphone and other sensitive WebView permissions are denied by default for this profile.");
          }}
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
  tabsRow: { marginTop: 2 },
  tabsContent: { gap: 6, paddingRight: 8 },
  tabChip: { maxWidth: 150, height: 30, borderRadius: 9, borderWidth: 1, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  tabTitle: { maxWidth: 100, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tabAdd: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
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
  nativeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 4 },
  nativeChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  nativeChipText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", padding: 16 },
  menuCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 4 },
  menuTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  menuText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  drawer: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "72%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingTop: 14, paddingHorizontal: 16 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  drawerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  drawerItem: { paddingVertical: 12, borderBottomWidth: 1 },
  drawerItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  drawerItemSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  drawerEmpty: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 40 },
  sessionCard: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10 },
  sessionMetric: { flex: 1, alignItems: "center", gap: 3 },
  sessionMetricValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sessionMetricLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  sessionHelp: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 12 },
  sessionNativeBox: { borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8 },
  sessionNativeTitle: { fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sessionNativeText: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },
  sessionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13, marginTop: 8 },
  sessionButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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

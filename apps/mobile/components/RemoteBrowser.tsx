import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { browserTargetUrl } from "../lib/browser-url";
import { getApiBaseUrl } from "../lib/api-url";
import { authenticatedFetch } from "../lib/auth";
import type {
  BrowserProfileViewRef,
  BrowserProfileViewProps,
} from "../modules/browser-profile/src";
import { useColors } from "../hooks/useColors";

export type RemoteState = {
  activeTabId: string;
  tabs: {
    id: string;
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
  }[];
  bookmarks: { url: string; title: string }[];
  history: { url: string; title: string; visitedAt: string }[];
  downloads: { id: string; name: string; size: number }[];
  filePickerOpen: boolean;
  egress: { mode: string; dns: string };
};
export type RemoteBrowserRef = BrowserProfileViewRef & {
  command(input: Record<string, unknown>): Promise<void>;
};
function base64(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    text +=
      alphabet[(n >>> 18) & 63] +
      alphabet[(n >>> 12) & 63] +
      (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") +
      (i + 2 < bytes.length ? alphabet[n & 63] : "=");
  }
  return text;
}
function target(raw: string) {
  return browserTargetUrl(raw, getApiBaseUrl());
}

/** The controller renders pixels only. Website cookies/storage/scripts never enter its WebView. */
export const RemoteBrowser = React.forwardRef<
  RemoteBrowserRef,
  BrowserProfileViewProps & { onState(state: RemoteState): void }
>(function RemoteBrowser(props, ref) {
  const colors = useColors();
  const prefix = `/api/accounts/${encodeURIComponent(props.profileId)}/browser`;
  const [state, setState] = useState<RemoteState | null>(null),
    [frame, setFrame] = useState(""),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [downloads, setDownloads] = useState(false);
  const live = useRef(true),
    paused = useRef(false),
    ready = useRef(false),
    busy = useRef(false),
    current = useRef<RemoteState | null>(null),
    url = useRef(props.url),
    callbacks = useRef(props),
    layout = useRef({ width: 390, height: 740 });
  callbacks.current = props;
  url.current = props.url;
  const apply = useCallback(
    (next: RemoteState) => {
      if (!live.current) return;
      const previous = current.current;
      if (previous)
        for (const item of next.downloads)
          if (!previous.downloads.some((existing) => existing.id === item.id))
            callbacks.current.onDownload?.({
              nativeEvent: { fileName: item.name },
            });
      current.current = next;
      setState(next);
      callbacks.current.onState(next);
      const tab = next.tabs.find((t) => t.id === next.activeTabId);
      if (tab)
        callbacks.current.onNavigationStateChange?.({
          nativeEvent: {
            profileId: props.profileId,
            url: tab.url,
            title: tab.title,
            canGoBack: tab.canGoBack,
            canGoForward: tab.canGoForward,
            loading: false,
          },
        });
    },
    [props.profileId],
  );
  const refreshFrame = useCallback(async () => {
    const response = await authenticatedFetch(`${prefix}/frame`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (live.current) setFrame(`data:image/jpeg;base64,${base64(data)}`);
  }, [prefix]);
  const command = useCallback(
    async (input: Record<string, unknown>) => {
      if (!live.current) return;
      busy.current = true;
      setError("");
      callbacks.current.onLoadingStateChange?.({
        nativeEvent: { loading: true, progress: 0.3 },
      });
      try {
        const response = await authenticatedFetch(`${prefix}/commands`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        apply(await response.json());
        await refreshFrame();
      } catch (e) {
        if (live.current)
          setError(
            "Browser request failed. Check worker availability and configured proxy; no direct fallback is used.",
          );
      } finally {
        busy.current = false;
        if (live.current)
          callbacks.current.onLoadingStateChange?.({
            nativeEvent: { loading: false, progress: 1 },
          });
      }
    },
    [prefix, apply, refreshFrame],
  );
  useImperativeHandle(
    ref,
    () => ({
      command,
      goBack: () => command({ action: "back" }),
      goForward: () => command({ action: "forward" }),
      reload: () => command({ action: "reload" }),
      stopLoading: () => command({ action: "stop" }),
      async injectJavaScript() {
        /* Intentionally unavailable across the remote browser security boundary. */
      },
      async clearProfileData() {
        await authenticatedFetch(`${prefix}/profile`, { method: "DELETE" });
        ready.current = false;
        current.current = null;
        setFrame("");
        const response = await authenticatedFetch(prefix);
        apply(await response.json());
        ready.current = true;
        if (url.current)
          await command({ action: "navigate", url: target(url.current) });
        else await refreshFrame();
      },
      async pause() {
        paused.current = true;
      },
      async resume() {
        paused.current = false;
      },
      async destroy() {
        await authenticatedFetch(`${prefix}/session`, { method: "DELETE" });
        ready.current = false;
      },
    }),
    [command, prefix, apply, refreshFrame],
  );
  useEffect(() => {
    live.current = true;
    ready.current = false;
    (async () => {
      try {
        const response = await authenticatedFetch(prefix),
          restored: RemoteState = await response.json();
        apply(restored);
        ready.current = true;
        if (restored.tabs.every((t) => t.url === "about:blank") && url.current)
          await command({ action: "navigate", url: target(url.current) });
        else await refreshFrame();
      } catch {
        if (live.current)
          setError(
            "Isolated browser worker unavailable. Configure the worker and egress before browsing.",
          );
      }
    })();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (live.current && ready.current && !paused.current && !busy.current) {
          await refreshFrame();
          const response = await authenticatedFetch(prefix);
          const next = await response.json();
          if (!busy.current) apply(next);
        }
      } catch {
        if (live.current)
          setError(
            "Browser disconnected. Check your connection and proxy, then retry.",
          );
      } finally {
        if (live.current) timer = setTimeout(poll, 1500);
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      live.current = false;
      clearTimeout(timer);
      void authenticatedFetch(`${prefix}/session`, { method: "DELETE" }).catch(
        () => {},
      );
    };
  }, [prefix, apply, command, refreshFrame]);
  useEffect(() => {
    const tab = current.current?.tabs.find(
      (t) => t.id === current.current?.activeTabId,
    );
    if (ready.current && props.url && target(props.url) !== tab?.url)
      void command({ action: "navigate", url: target(props.url) });
  }, [props.url, command]);
  const gestures = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (event, gesture) => {
          const scale = Math.min(
            layout.current.width / 390,
            layout.current.height / 740,
          );
          const ox = (layout.current.width - 390 * scale) / 2,
            oy = (layout.current.height - 740 * scale) / 2;
          if (Math.abs(gesture.dy) > 20)
            void command({
              action: "scroll",
              deltaY: Math.max(-10000, Math.min(10000, -gesture.dy / scale)),
            });
          else {
            const x = (event.nativeEvent.locationX - ox) / scale,
              y = (event.nativeEvent.locationY - oy) / scale;
            if (x >= 0 && x <= 390 && y >= 0 && y <= 740)
              void command({ action: "tap", x, y });
          }
        },
      }),
    [command],
  );
  async function upload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 3 * 1024 * 1024) {
        Alert.alert("Upload limit", "Choose a file up to 3 MB.");
        return;
      }
      const data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await command({
        action: "upload",
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        base64: data,
      });
      await FileSystem.deleteAsync(asset.uri, { idempotent: true });
    } catch {
      Alert.alert("Upload failed", "Reopen the page's file picker and retry.");
    }
  }
  async function share(id: string, name: string) {
    let file: string | undefined;
    try {
      const response = await authenticatedFetch(`${prefix}/downloads/${id}`);
      file = `${FileSystem.cacheDirectory}${id}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await FileSystem.writeAsStringAsync(
        file,
        base64(new Uint8Array(await response.arrayBuffer())),
        { encoding: FileSystem.EncodingType.Base64 },
      );
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file);
      else
        Alert.alert(
          "Sharing unavailable",
          "This controller platform cannot share local files.",
        );
    } catch {
      Alert.alert("Download failed", "Check your connection and retry.");
    } finally {
      if (file) await FileSystem.deleteAsync(file, { idempotent: true });
    }
  }
  return (
    <View style={[props.style, { backgroundColor: colors.background }]}>
      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          layout.current = event.nativeEvent.layout;
        }}
        {...gestures.panHandlers}
      >
        {frame ? (
          <Image
            source={{ uri: frame }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        ) : (
          <ActivityIndicator style={{ flex: 1 }} />
        )}
      </View>
      {error ? (
        <Pressable
          onPress={() => {
            void command({ action: "reload" });
          }}
        >
          <Text style={{ color: colors.destructive, padding: 8 }}>
            {error} Tap to retry.
          </Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, padding: 8 }}>
        <TextInput
          accessibilityLabel="Type in focused browser field"
          secureTextEntry
          autoCorrect={false}
          value={text}
          onChangeText={setText}
          placeholder="Tap a field, then type here"
          style={{
            flex: 1,
            color: colors.foreground,
            borderColor: colors.border,
            borderWidth: 1,
            padding: 6,
          }}
        />
        <Pressable
          onPress={() => {
            void command({ action: "type", text });
            setText("");
          }}
        >
          <Text style={{ color: colors.primary }}>Send</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void command({ action: "key", text: "Enter" });
          }}
        >
          <Text style={{ color: colors.primary }}>Enter</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void command({ action: "key", text: "Backspace" });
          }}
        >
          <Text style={{ color: colors.primary }}>⌫</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 16, padding: 8 }}>
        {state?.filePickerOpen ? (
          <Pressable onPress={upload}>
            <Text style={{ color: colors.primary }}>Choose upload</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setDownloads(true)}>
          <Text style={{ color: colors.primary }}>
            Downloads ({state?.downloads.length ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            try {
              const response = await authenticatedFetch(
                `${prefix}/verify-egress`,
                { method: "POST" },
              );
              const result = await response.json();
              Alert.alert(
                "Verified egress",
                `${result.ip}\nDNS: ${result.dns}\n${result.checkedAt}`,
              );
            } catch {
              Alert.alert(
                "Verification failed",
                "Configure a trusted IP-check endpoint and verify your proxy.",
              );
            }
          }}
        >
          <Text style={{ color: colors.primary }}>Check IP</Text>
        </Pressable>
      </View>
      <Modal
        visible={downloads}
        animationType="slide"
        onRequestClose={() => setDownloads(false)}
      >
        <View
          style={{ flex: 1, padding: 24, backgroundColor: colors.background }}
        >
          <Pressable onPress={() => setDownloads(false)}>
            <Text style={{ color: colors.primary }}>Close downloads</Text>
          </Pressable>
          {state?.downloads.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => share(item.id, item.name)}
              style={{ paddingVertical: 16 }}
            >
              <Text style={{ color: colors.foreground }}>
                {item.name} ({item.size} bytes) — share
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
});

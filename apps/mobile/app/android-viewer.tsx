import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { customFetch } from "@workspace/api-client-react";
import { remoteViewerHtml } from "../lib/remote-viewer";

type Session = {
  id: string;
  expiresAt: string;
  iceServers: unknown[];
  signal: unknown;
};
const post = <T,>(path: string, data: unknown = {}) =>
  customFetch<T>(`/api/remote${path}`, {
    method: "POST",
    body: JSON.stringify(data),
    responseType: "json",
    signal: AbortSignal.timeout(5000),
  });
export default function AndroidViewer() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const web = useRef<WebView>(null),
    session = useRef<Session | null>(null),
    mounted = useRef(true);
  const [resolution, setResolution] = useState(720),
    [status, setStatus] = useState(
      "Authorize capture on the Companion, then connect.",
    ),
    [running, setRunning] = useState(false),
    [text, setText] = useState(""),
    [ready, setReady] = useState(false);
  const pendingSignal = useRef<unknown>(null),
    operation = useRef(0),
    connecting = useRef(false);
  const inject = (fn: string, value: unknown) =>
    web.current?.injectJavaScript(
      `window.${fn}(${JSON.stringify(value).replace(/</g, "\\u003c")});true;`,
    );
  async function stop() {
    operation.current++;
    connecting.current = false;
    const old = session.current;
    session.current = null;
    pendingSignal.current = null;
    web.current?.injectJavaScript("window.remoteStop();true;");
    if (mounted.current) {
      setRunning(false);
      setStatus("Disconnected");
    }
    if (old)
      try {
        await customFetch(`/api/remote/${old.id}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* Device lease expires if the revoke request cannot arrive. */
      }
  }
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void stop();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      void stop();
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    let lastSuccess = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastSuccess > 4000) void stop();
    }, 250);
    async function poll() {
      const s = session.current;
      if (!s || cancelled) return;
      if (Date.now() >= Date.parse(s.expiresAt)) {
        await stop();
        return;
      }
      try {
        const snapshot = pendingSignal.current;
        if (snapshot) {
          await post(`/${s.id}/signal`, snapshot);
          if (pendingSignal.current === snapshot) pendingSignal.current = null;
        }
        const state = await post<Session>(`/${s.id}/poll`);
        if (cancelled || session.current !== s) return;
        lastSuccess = Date.now();
        inject("remoteUpdate", state);
      } catch (error: any) {
        if (
          error?.status === 401 ||
          error?.status === 410 ||
          error?.status === 404
        ) {
          await stop();
          return;
        }
        inject("remotePause", null);
        if (mounted.current) setStatus("Reconnecting · input paused");
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(watchdog);
    };
  }, [running]);
  async function connect() {
    if (connecting.current || session.current) return;
    connecting.current = true;
    const epoch = ++operation.current;
    try {
      setStatus("Connecting");
      const s = await post<Session>("/", { deviceId, resolution });
      if (!mounted.current || operation.current !== epoch) {
        await customFetch(`/api/remote/${s.id}`, { method: "DELETE" });
        return;
      }
      session.current = s;
      setRunning(true);
      inject("remoteStart", s.iceServers);
    } catch {
      if (mounted.current && operation.current === epoch)
        setStatus(
          "Unable to connect. Check assignment, capture consent and API connectivity.",
        );
    } finally {
      if (operation.current === epoch) connecting.current = false;
    }
  }
  async function command(data: unknown) {
    const s = session.current;
    if (!s) return;
    try {
      await post(`/${s.id}/command`, data);
    } catch {
      if (mounted.current)
        setStatus("Input refused · check Accessibility and session connection");
    }
  }
  return (
    <View style={{ flex: 1, paddingTop: 48, paddingHorizontal: 12, gap: 8 }}>
      <Pressable
        onPress={() => {
          void stop();
          router.back();
        }}
      >
        <Text>Back to Device Hub</Text>
      </Pressable>
      <Text>Android screen · {status}</Text>
      <Text>
        Five-minute session. Tap/swipe the picture. Capture and Accessibility
        must be enabled on the phone.
      </Text>
      {!running ? (
        <View style={{ flexDirection: "row", gap: 16 }}>
          {[360, 720, 1080].map((r) => (
            <Pressable key={r} onPress={() => setResolution(r)}>
              <Text>
                {r === resolution ? "✓ " : ""}
                {r}p
              </Text>
            </Pressable>
          ))}
          <Pressable disabled={!ready} onPress={() => void connect()}>
            <Text>Connect</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => void stop()}>
          <Text>Stop and revoke session</Text>
        </Pressable>
      )}
      <WebView
        ref={web}
        style={{ flex: 1, backgroundColor: "#111" }}
        source={{
          html: remoteViewerHtml,
          baseUrl: "https://viewer.browserproxy.invalid",
        }}
        originWhitelist={["https://viewer.browserproxy.invalid"]}
        onShouldStartLoadWithRequest={(r) =>
          r.url === "https://viewer.browserproxy.invalid/" ||
          r.url === "https://viewer.browserproxy.invalid" ||
          r.url === "about:blank"
        }
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onRenderProcessGone={() => void stop()}
        onContentProcessDidTerminate={() => void stop()}
        onError={() => void stop()}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === "ready") setReady(true);
            else if (
              message.type === "status" &&
              typeof message.data === "string"
            )
              setStatus(message.data.slice(0, 180));
            else if (message.type === "signal" && session.current)
              pendingSignal.current = message.data;
            else if (message.type === "command") void command(message.data);
          } catch {
            /* Reject malformed bridge messages. */
          }
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {["back", "home", "recents"].map((action) => (
          <Pressable
            key={action}
            disabled={!running}
            onPress={() => void command({ type: "navigation", action })}
          >
            <Text>{action}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={500}
        placeholder="Replace focused non-password text"
      />
      <Pressable
        disabled={!running || !text}
        onPress={() =>
          Alert.alert(
            "Replace text on phone?",
            "Only the focused non-password editable field is supported.",
            [
              { text: "Cancel" },
              {
                text: "Send",
                onPress: () => {
                  void command({ type: "text", text });
                  setText("");
                },
              },
            ],
          )
        }
      >
        <Text>Send text</Text>
      </Pressable>
    </View>
  );
}

import React, { useImperativeHandle, useMemo, useRef } from "react";
import {
  WebView,
  type WebViewNavigation,
  type WebViewProps,
} from "react-native-webview";
import type {
  BrowserProfileViewProps,
  BrowserProfileViewRef,
} from "../modules/browser-profile/src";
import { buildBrowserStateClearScript } from "../lib/browser-state";

type Props = BrowserProfileViewProps & {
  nativeEnabled?: boolean;
  onShouldStartLoadWithRequest?: WebViewProps["onShouldStartLoadWithRequest"];
};

/** Retain the native bridge, but use the SDK WebView until a verified host exists. */
export const BrowserHost = React.forwardRef<BrowserProfileViewRef, Props>(
  function BrowserHost(
    { nativeEnabled = false, onShouldStartLoadWithRequest, ...props },
    ref,
  ) {
    const standard = useRef<WebView>(null);
    const native = useRef<BrowserProfileViewRef>(null);
    const NativeHost = useMemo(
      () =>
        nativeEnabled
          ? (
              require("../modules/browser-profile/src") as typeof import("../modules/browser-profile/src")
            ).BrowserProfileView
          : null,
      [nativeEnabled],
    );

    useImperativeHandle(
      ref,
      () => ({
        async goBack() {
          if (nativeEnabled) await native.current?.goBack();
          else standard.current?.goBack();
        },
        async goForward() {
          if (nativeEnabled) await native.current?.goForward();
          else standard.current?.goForward();
        },
        async reload() {
          if (nativeEnabled) await native.current?.reload();
          else standard.current?.reload();
        },
        async stopLoading() {
          if (nativeEnabled) await native.current?.stopLoading();
          else standard.current?.stopLoading();
        },
        async injectJavaScript(script) {
          if (nativeEnabled) await native.current?.injectJavaScript(script);
          else standard.current?.injectJavaScript(script);
        },
        async clearProfileData() {
          if (nativeEnabled) await native.current?.clearProfileData();
          else {
            standard.current?.injectJavaScript(buildBrowserStateClearScript());
            standard.current?.clearCache?.(true);
          }
        },
        async pause() {
          if (nativeEnabled) await native.current?.pause();
        },
        async resume() {
          if (nativeEnabled) await native.current?.resume();
        },
        async destroy() {
          if (nativeEnabled) await native.current?.destroy();
          else standard.current?.stopLoading();
        },
      }),
      [nativeEnabled],
    );

    if (NativeHost) return <NativeHost {...props} ref={native} />;
    const onNavigation = (state: WebViewNavigation) =>
      props.onNavigationStateChange?.({
        nativeEvent: { ...state, profileId: props.profileId },
      });
    return (
      <WebView
        key={props.profileId}
        ref={standard}
        source={{ uri: props.url || "about:blank" }}
        style={props.style}
        userAgent={props.userAgent}
        injectedJavaScriptBeforeContentLoaded={props.injectedJavaScript}
        injectedJavaScriptForMainFrameOnly={false}
        onMessage={props.onMessage}
        onNavigationStateChange={onNavigation}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onLoadStart={() =>
          props.onLoadingStateChange?.({
            nativeEvent: { loading: true, progress: 0 },
          })
        }
        onLoadProgress={({ nativeEvent }) =>
          props.onLoadingStateChange?.({
            nativeEvent: { loading: true, progress: nativeEvent.progress },
          })
        }
        onLoadEnd={() =>
          props.onLoadingStateChange?.({
            nativeEvent: { loading: false, progress: 1 },
          })
        }
        onError={({ nativeEvent }) =>
          props.onError?.({
            nativeEvent: {
              description: nativeEvent.description,
              code: nativeEvent.code,
              url: nativeEvent.url,
            },
          })
        }
        onFileDownload={({ nativeEvent }) =>
          props.onDownload?.({
            nativeEvent: {
              ...nativeEvent,
              fileName: nativeEvent.downloadUrl.split("/").pop(),
            },
          })
        }
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        incognito={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        allowsFullscreenVideo={false}
        cacheEnabled={false}
        mixedContentMode="never"
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mediaCapturePermissionGrantType="deny"
        contentInsetAdjustmentBehavior="never"
      />
    );
  },
);

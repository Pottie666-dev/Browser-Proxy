import { requireNativeViewManager } from "expo-modules-core";
import React from "react";
import type { ViewProps } from "react-native";

export type BrowserNavigationEvent = {
  nativeEvent: {
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    loading: boolean;
    profileId: string;
  };
};

export type BrowserLoadingEvent = { nativeEvent: { loading: boolean; progress: number } };
export type BrowserMessageEvent = { nativeEvent: { data: string } };
export type BrowserErrorEvent = { nativeEvent: { description: string; code: number; url: string } };

export type BrowserProfileViewProps = ViewProps & {
  profileId: string;
  url?: string;
  userAgent?: string;
  injectedJavaScript?: string;
  onNavigationStateChange?: (event: BrowserNavigationEvent) => void;
  onLoadingStateChange?: (event: BrowserLoadingEvent) => void;
  onMessage?: (event: BrowserMessageEvent) => void;
  onDownload?: (event: { nativeEvent: Record<string, unknown> }) => void;
  onPermissionRequest?: (event: { nativeEvent: Record<string, unknown> }) => void;
  onError?: (event: BrowserErrorEvent) => void;
};

export type BrowserProfileViewRef = {
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stopLoading(): Promise<void>;
  injectJavaScript(script: string): Promise<void>;
  clearProfileData(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
};

const NativeView = requireNativeViewManager<BrowserProfileViewProps>("BrowserProfile");
export const BrowserProfileView = React.forwardRef<BrowserProfileViewRef, BrowserProfileViewProps>((props, ref) => (
  React.createElement(NativeView, { ...props, ref: ref as never })
));
BrowserProfileView.displayName = "BrowserProfileView";

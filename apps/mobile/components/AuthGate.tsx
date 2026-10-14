import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { getApiBaseUrl } from "../lib/api-url";
import { useColors } from "../hooks/useColors";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const colors = useColors();
  const queries = useQueryClient();
  const [origin, setOrigin] = useState(getApiBaseUrl());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    queries.clear();
  }, [auth.session?.userId, queries]);
  useEffect(() => {
    if (!auth.loading) setOrigin(getApiBaseUrl());
  }, [auth.loading]);
  if (auth.loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (auth.session)
    return (
      <React.Fragment key={auth.session.userId}>{children}</React.Fragment>
    );
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (
        !__DEV__ ||
        origin !== getApiBaseUrl() ||
        origin.startsWith("https://")
      )
        await auth.configureApiOrigin(origin);
      await auth.signIn(email.trim(), password, register);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Browser-Proxy
      </Text>
      <Text style={{ color: colors.mutedForeground }}>
        {register ? "Create your user login" : "Sign in to your account vault"}
      </Text>
      <TextInput
        accessibilityLabel="Public HTTPS API origin"
        placeholder="https://api.your-domain.com"
        autoCapitalize="none"
        autoCorrect={false}
        value={origin}
        onChangeText={setOrigin}
        editable={!busy}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border },
        ]}
      />
      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border },
        ]}
      />
      <TextInput
        accessibilityLabel="Password"
        placeholder="Password (at least 12 characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border },
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={submit}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: "white" }}>
          {busy ? "Please wait…" : register ? "Register" : "Sign in"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setRegister(!register);
          setError("");
        }}
      >
        <Text style={{ color: colors.primary }}>
          {register
            ? "Back to sign in"
            : "Register, if enabled by your administrator"}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 28, gap: 16 },
  title: { fontSize: 28, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 8, padding: 12 },
  button: { padding: 14, borderRadius: 8, alignItems: "center" },
});

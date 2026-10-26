import React, { useState } from "react";
import { ScrollView, Text, Pressable, Alert, TextInput } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDevices,
  createDevicePairing,
  assignDevice,
  revokeDevice,
  useListAccounts,
} from "@workspace/api-client-react";
export default function DeviceHub() {
  const cache = useQueryClient();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => listDevices(),
    refetchInterval: 30000,
  });
  const accounts = useListAccounts();
  const [code, setCode] = useState("");
  const [expires, setExpires] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      await cache.invalidateQueries({ queryKey: ["devices"] });
    } catch {
      Alert.alert(
        "Device action failed",
        "Check your connection and account assignment.",
      );
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingTop: 60, gap: 16 }}
    >
      <Pressable onPress={() => router.back()}>
        <Text>Back to accounts</Text>
      </Pressable>
      <Text style={{ fontSize: 28 }}>Device Hub</Text>
      <Text>
        Browser-only accounts do not require a phone. Presence expires after 90
        seconds without a heartbeat.
      </Text>
      <Pressable
        onPress={() =>
          action(async () => {
            const grant = await createDevicePairing();
            setCode(grant.code);
            setExpires(grant.expiresAt);
          })
        }
      >
        <Text>Create five-minute pairing code</Text>
      </Pressable>
      {code ? (
        <>
          <TextInput
            value={code}
            editable={false}
            selectTextOnFocus
            multiline
          />
          <Text>
            Expires {expires}. Enter this code in the Companion. Treat it as a
            password.
          </Text>
          <Pressable onPress={() => setCode("")}>
            <Text>Hide code</Text>
          </Pressable>
        </>
      ) : null}
      <Text>Select account for assignment:</Text>
      <Pressable onPress={() => setSelection(null)}>
        <Text>{selection === null ? "✓ " : ""}Unassigned</Text>
      </Pressable>
      {accounts.data?.map((a) => (
        <Pressable key={a.id} onPress={() => setSelection(a.id)}>
          <Text>
            {selection === a.id ? "✓ " : ""}
            {a.name}
          </Text>
        </Pressable>
      ))}
      {devices.isError ? <Text>Unable to load devices</Text> : null}
      {devices.data?.map((d) => (
        <React.Fragment key={d.id}>
          <Text style={{ fontWeight: "bold" }}>
            {d.name} · {d.revoked ? "Revoked" : d.online ? "Online" : "Offline"}
          </Text>
          <Text>
            Account:{" "}
            {accounts.data?.find((a) => a.id === d.accountId)?.name ??
              "Unassigned"}
          </Text>
          <Text>
            Battery: {String(d.status.batteryPercent ?? "Unknown")}% ·{" "}
            {d.status.charging ? "Charging" : "Not charging"}
          </Text>
          <Text>
            Temperature: {String(d.status.temperatureC ?? "Unknown")} °C ·
            Android {String(d.status.androidVersion ?? "Unknown")}
          </Text>
          <Text>
            Screen capture: {d.status.captureActive ? "Active" : "Off"} ·
            Accessibility: {d.status.accessibilityEnabled ? "Enabled" : "Off"}
          </Text>
          {!d.revoked ? (
            <>
              {d.accountId ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/android-viewer",
                      params: { deviceId: d.id },
                    })
                  }
                >
                  <Text>Open live Android screen</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  action(() => assignDevice(d.id, { accountId: selection }))
                }
              >
                <Text>Assign selected account / unassign</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Revoke device?",
                    "This invalidates its credential immediately.",
                    [
                      { text: "Cancel" },
                      {
                        text: "Revoke",
                        style: "destructive",
                        onPress: () => action(() => revokeDevice(d.id)),
                      },
                    ],
                  )
                }
              >
                <Text>Revoke</Text>
              </Pressable>
            </>
          ) : null}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

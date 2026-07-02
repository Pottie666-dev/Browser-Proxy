import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import {
  useListAccounts,
  useDeleteAccount,
  getListAccountsQueryKey,
  type Account,
} from "@workspace/api-client-react";

function getDeviceColor(deviceName: string | undefined | null, primary: string) {
  deviceName = deviceName ?? "";
  if (deviceName.includes("iPhone")) return "#007aff";
  if (deviceName.includes("Samsung")) return "#1428a0";
  if (deviceName.includes("Google")) return "#4285f4";
  if (deviceName.includes("OnePlus")) return "#eb0029";
  if (deviceName.includes("Xiaomi")) return "#ff6900";
  if (deviceName.includes("Sony")) return "#003087";
  return primary;
}

function initials(name: string, surname: string) {
  return `${(name ?? "").charAt(0)}${(surname ?? "").charAt(0)}`.toUpperCase();
}

function CopyRow({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  const colors = useColors();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <View style={[cr.row, { borderBottomColor: colors.border }]}>
      <Text style={[cr.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[cr.value, { color: colors.foreground }]} numberOfLines={masked && !revealed ? 1 : 2}>
        {masked && !revealed ? "••••••••" : value}
      </Text>
      <View style={cr.btns}>
        {masked && (
          <TouchableOpacity onPress={() => setRevealed(r => !r)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[cr.btn, { backgroundColor: colors.muted }]}>
            <Feather name={revealed ? "eye-off" : "eye"} size={12} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={doCopy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[cr.btn, { backgroundColor: copied ? colors.primary + "20" : colors.muted }]}>
          <Feather name={copied ? "check" : "copy"} size={12} color={copied ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CopyBtn({ value }: { value: string }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <TouchableOpacity onPress={doCopy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[cr.btn, { backgroundColor: copied ? colors.primary + "20" : colors.muted }]}>
      <Feather name={copied ? "check" : "copy"} size={12} color={copied ? colors.primary : colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const cr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, gap: 8 },
  label: { width: 72, fontSize: 11, fontFamily: "Inter_500Medium" },
  value: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  btns: { flexDirection: "row", gap: 5 },
  btn: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});

function AccountCard({ account, onPress, onEdit, onDelete }: {
  account: Account; onPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const devColor = getDeviceColor(account.deviceName, colors.primary);
  const ini = initials(account.name ?? "", account.surname ?? "");
  const hasImages = !!(account.image1 || account.image2);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={({ pressed }) => [styles.cardHeader, { opacity: pressed ? 0.85 : 1 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
        <View style={[styles.avatar, { backgroundColor: devColor }]}>
          <Text style={styles.avatarText}>{ini}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.foreground }]}>{account.name} {account.surname}</Text>
            {hasImages && (
              <View style={[styles.imgBadge, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="image" size={9} color={colors.primary} />
                <Text style={[styles.imgBadgeText, { color: colors.primary }]}>{[account.image1, account.image2].filter(Boolean).length}</Text>
              </View>
            )}
          </View>
          {account.username ? <Text style={[styles.cardUsername, { color: colors.primary }]}>@{account.username}</Text> : null}
          <Text style={[styles.cardEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{account.email}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.badge, { backgroundColor: devColor + "15" }]}>
              <Feather name="smartphone" size={9} color={devColor} />
              <Text style={[styles.badgeText, { color: devColor }]} numberOfLines={1}>{account.deviceName}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Feather name="wifi" size={9} color={colors.mutedForeground} />
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{account.fakeIp}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.muted }]} onPress={(e) => { e.stopPropagation(); onEdit(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Feather name="edit-2" size={12} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.destructive + "15" }]} onPress={(e) => { e.stopPropagation(); onDelete(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Feather name="trash-2" size={12} color={colors.destructive} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: expanded ? colors.primary + "20" : colors.muted }]} onPress={() => { setExpanded(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={expanded ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </Pressable>

      {expanded && (
        <View style={[styles.panel, { borderTopColor: colors.border }]}>
          {account.username ? <CopyRow label="Username" value={account.username} /> : null}
          <CopyRow label="Email" value={account.email} />
          <CopyRow label="Password" value={account.password} masked />
          <CopyRow label="Wallet name" value={account.walletName} />
          {account.idNumber ? <CopyRow label="ID number" value={account.idNumber} /> : null}
          {account.cryptoAddress ? <CopyRow label="Crypto addr" value={account.cryptoAddress} /> : null}
          <CopyRow label="Device" value={account.deviceName} />
          <CopyRow label="Fake IP" value={account.fakeIp} />
          <View style={[cr.row, { borderBottomWidth: 0 }]}>
            <Text style={[cr.label, { color: colors.mutedForeground }]}>User-Agent</Text>
            <Text style={[cr.value, { color: colors.foreground, fontSize: 10 }]} numberOfLines={3}>{account.userAgent}</Text>
            <View style={cr.btns}><CopyBtn value={account.userAgent} /></View>
          </View>
          {(account.image1 || account.image2) && (
            <View style={styles.imagesPanel}>
              <Text style={[styles.imagesPanelLabel, { color: colors.mutedForeground }]}>STORED IMAGES</Text>
              <View style={styles.imagesRow}>
                {account.image1 ? <View style={styles.thumbWrap}><Image source={{ uri: account.image1 }} style={[styles.thumb, { borderColor: colors.border }]} contentFit="cover" /><Text style={[styles.thumbLabel, { color: colors.mutedForeground }]}>Image 1</Text></View> : null}
                {account.image2 ? <View style={styles.thumbWrap}><Image source={{ uri: account.image2 }} style={[styles.thumb, { borderColor: colors.border }]} contentFit="cover" /><Text style={[styles.thumbLabel, { color: colors.mutedForeground }]}>Image 2</Text></View> : null}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function AccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading, isError, refetch } = useListAccounts();
  const deleteAccount = useDeleteAccount();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function handleDelete(account: Account) {
    Alert.alert("Delete Account", `Remove ${account.name} ${account.surname}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteAccount.mutate({ id: account.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } }) },
    ]);
  }

  function handleOpenBrowser(account: Account) {
    router.push({
      pathname: "/browser",
      params: {
        accountId: account.id,
        accountEmail: account.email,
        accountName: `${account.name} ${account.surname}`,
        deviceName: account.deviceName,
        userAgent: account.userAgent,
        fakeIp: account.fakeIp,
        image1: account.image1 ?? "",
        image2: account.image2 ?? "",
      },
    });
  }

  function handleEdit(account: Account) {
    router.push({
      pathname: "/account-form",
      params: {
        accountId: account.id,
        name: account.name, surname: account.surname,
        email: account.email, password: account.password,
        walletName: account.walletName,
        username: account.username ?? "",
        idNumber: account.idNumber ?? "",
        cryptoAddress: account.cryptoAddress ?? "",
        image1: account.image1 ?? "", image2: account.image2 ?? "",
      },
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Vault</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{accounts?.length ?? 0} {accounts?.length === 1 ? "account" : "accounts"}</Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/account-form"); }} activeOpacity={0.8}>
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      {isLoading && <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>}
      {isError && (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Connection error</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isLoading && !isError && (
        <FlatList
          data={accounts ?? []}
          keyExtractor={(item, index) => String(item?.id ?? item?._id ?? index)}
          contentContainerStyle={[styles.list, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 16 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}><Feather name="shield" size={32} color={colors.mutedForeground} /></View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No accounts yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add your first account to start browsing privately</Text>
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/account-form")} activeOpacity={0.8}>
                <Feather name="plus" size={16} color={colors.primaryForeground} />
                <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Add Account</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item }) => <AccountCard account={item} onPress={() => handleOpenBrowser(item)} onEdit={() => handleEdit(item)} onDelete={() => handleDelete(item)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  cardBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  imgBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  imgBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardUsername: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  cardActions: { flexDirection: "column", gap: 6 },
  actionBtn: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  panel: { paddingHorizontal: 16, paddingBottom: 8, borderTopWidth: 1 },
  imagesPanel: { marginTop: 8, paddingTop: 8 },
  imagesPanelLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8 },
  imagesRow: { flexDirection: "row", gap: 12 },
  thumbWrap: { alignItems: "center", gap: 4 },
  thumb: { width: 72, height: 72, borderRadius: 10, borderWidth: 1 },
  thumbLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  emptyBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

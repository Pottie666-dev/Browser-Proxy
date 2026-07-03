import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import {
  getListAccountsQueryKey,
  useDeleteAccount,
  useListAccounts,
  useUpdateAccount,
  type Account,
} from "@workspace/api-client-react";

type VaultAccount = Account & {
  _id?: string;
  surname?: string | null;
  username?: string | null;
  email?: string | null;
  password?: string | null;
  walletName?: string | null;
  idNumber?: string | null;
  cryptoAddress?: string | null;
  deviceName?: string | null;
  fakeIp?: string | null;
  userAgent?: string | null;
  image1?: string | null;
  image2?: string | null;
  favorite?: boolean | null;
  tags?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SortMode = "recent" | "name" | "device" | "favorites";

function accountId(account: VaultAccount, index = 0): string {
  return String(account.id ?? account._id ?? index);
}

function fullName(account: VaultAccount): string {
  return [account.name, account.surname].filter(Boolean).join(" ").trim() || "Unnamed Account";
}

function initials(account: VaultAccount): string {
  const name = String(account.name ?? "");
  const surname = String(account.surname ?? "");
  const fallback = fullName(account);
  return `${name.charAt(0) || fallback.charAt(0)}${surname.charAt(0) || ""}`.toUpperCase();
}

function getDeviceColor(deviceName: string | undefined | null, primary: string) {
  const device = deviceName ?? "";
  if (device.includes("iPhone")) return "#007aff";
  if (device.includes("Samsung")) return "#1428a0";
  if (device.includes("Google")) return "#4285f4";
  if (device.includes("OnePlus")) return "#eb0029";
  if (device.includes("Xiaomi")) return "#ff6900";
  if (device.includes("Sony")) return "#003087";
  if (device.includes("Oppo")) return "#18a058";
  return primary;
}

function searchableText(account: VaultAccount): string {
  return [
    account.name,
    account.surname,
    account.username,
    account.email,
    account.deviceName,
    account.fakeIp,
    account.walletName,
    account.idNumber,
    account.cryptoAddress,
    ...(account.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortAccounts(accounts: VaultAccount[], mode: SortMode): VaultAccount[] {
  const sorted = [...accounts];

  if (mode === "favorites") {
    return sorted.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || fullName(a).localeCompare(fullName(b)));
  }

  if (mode === "name") {
    return sorted.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }

  if (mode === "device") {
    return sorted.sort((a, b) => String(a.deviceName ?? "").localeCompare(String(b.deviceName ?? "")) || fullName(a).localeCompare(fullName(b)));
  }

  return sorted.sort((a, b) => {
    const ad = new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime();
    const bd = new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime();
    return bd - ad;
  });
}

function CopyRow({ label, value, masked }: { label: string; value?: string | null; masked?: boolean }) {
  const colors = useColors();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  async function doCopy() {
    await Clipboard.setStringAsync(value ?? "");
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <View style={[cr.row, { borderBottomColor: colors.border }]}>
      <Text style={[cr.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[cr.value, { color: colors.foreground }]} numberOfLines={1}>
        {masked && !revealed ? "••••••••" : value}
      </Text>
      <View style={cr.btns}>
        {masked ? (
          <TouchableOpacity onPress={() => setRevealed((r) => !r)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[cr.btn, { backgroundColor: colors.muted }]}>
            <Feather name={revealed ? "eye-off" : "eye"} size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={doCopy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[cr.btn, { backgroundColor: copied ? colors.primary : colors.muted }]}>
          <Feather name={copied ? "check" : "copy"} size={13} color={copied ? colors.primaryForeground : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AccountCard({
  account,
  onPress,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  account: VaultAccount;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const devColor = getDeviceColor(account.deviceName, colors.primary);
  const hasImages = Boolean(account.image1 || account.image2);
  const tags = account.tags ?? [];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: account.favorite ? colors.primary : colors.border }]}>
      <Pressable
        style={({ pressed }) => [styles.cardHeader, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
      >
        <View style={[styles.avatar, { backgroundColor: devColor }]}>
          <Text style={styles.avatarText}>{initials(account)}</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
              {fullName(account)}
            </Text>
            {hasImages ? (
              <View style={[styles.imgBadge, { backgroundColor: colors.primary + "16" }]}>
                <Feather name="image" size={10} color={colors.primary} />
                <Text style={[styles.imgBadgeText, { color: colors.primary }]}>{[account.image1, account.image2].filter(Boolean).length}</Text>
              </View>
            ) : null}
          </View>

          {account.username ? <Text style={[styles.cardUsername, { color: colors.primary }]} numberOfLines={1}>@{account.username}</Text> : null}
          {account.email ? <Text style={styles.cardEmail} numberOfLines={1}>{account.email}</Text> : null}

          <View style={styles.cardMeta}>
            {account.deviceName ? (
              <View style={[styles.badge, { backgroundColor: devColor + "18" }]}>
                <Feather name="smartphone" size={10} color={devColor} />
                <Text style={[styles.badgeText, { color: devColor }]} numberOfLines={1}>{account.deviceName}</Text>
              </View>
            ) : null}
            {account.fakeIp ? (
              <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                <Feather name="wifi" size={10} color={colors.mutedForeground} />
                <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{account.fakeIp}</Text>
              </View>
            ) : null}
          </View>

          {tags.length ? (
            <View style={styles.tagRow}>
              {tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + "12" }]}>
                  <Text style={[styles.tagText, { color: colors.primary }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.actionBtn, { backgroundColor: account.favorite ? colors.primary + "18" : colors.muted }]}
          >
            <Feather name="star" size={14} color={account.favorite ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          >
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.actionBtn, { backgroundColor: colors.destructive + "14" }]}
          >
            <Feather name="trash-2" size={14} color={colors.destructive} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.actionBtn, { backgroundColor: colors.muted }]}
          >
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.panel, { borderTopColor: colors.border }]}>
          <CopyRow label="Username" value={account.username} />
          <CopyRow label="Password" value={account.password} masked />
          <CopyRow label="Email" value={account.email} />
          <CopyRow label="ID" value={account.idNumber} masked />
          <CopyRow label="Wallet" value={account.walletName} />
          <CopyRow label="Crypto" value={account.cryptoAddress} />
          <CopyRow label="User-Agent" value={account.userAgent} />

          {(account.image1 || account.image2) ? (
            <View style={styles.imagesPanel}>
              <Text style={[styles.imagesPanelLabel, { color: colors.mutedForeground }]}>STORED IMAGES</Text>
              <View style={styles.imagesRow}>
                {account.image1 ? <Image source={{ uri: account.image1 }} style={[styles.thumb, { borderColor: colors.border }]} /> : null}
                {account.image2 ? <Image source={{ uri: account.image2 }} style={[styles.thumb, { borderColor: colors.border }]} /> : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function AccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useListAccounts();
  const deleteAccount = useDeleteAccount();
  const updateAccount = useUpdateAccount();

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const accounts = (data ?? []) as VaultAccount[];
  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? accounts.filter((account) => searchableText(account).includes(q)) : accounts;
    return sortAccounts(filtered, sortMode);
  }, [accounts, query, sortMode]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function handleDelete(account: VaultAccount) {
    Alert.alert("Delete Account", `Remove ${fullName(account)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteAccount.mutate(
            { id: accountId(account) },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            },
          ),
      },
    ]);
  }

  function handleToggleFavorite(account: VaultAccount) {
    updateAccount.mutate(
      { id: accountId(account), data: { favorite: !account.favorite } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    );
  }

  function handleOpenBrowser(account: VaultAccount) {
    router.push({
      pathname: "/browser",
      params: {
        accountId: accountId(account),
        accountEmail: account.email ?? "",
        accountName: fullName(account),
        deviceName: account.deviceName ?? "",
        userAgent: account.userAgent ?? "",
        fakeIp: account.fakeIp ?? "",
        image1: account.image1 ?? "",
        image2: account.image2 ?? "",
      },
    });
  }

  function handleEdit(account: VaultAccount) {
    router.push({
      pathname: "/account-form",
      params: {
        accountId: accountId(account),
        name: account.name ?? "",
        surname: account.surname ?? "",
        email: account.email ?? "",
        password: account.password ?? "",
        walletName: account.walletName ?? "",
        username: account.username ?? "",
        idNumber: account.idNumber ?? "",
        cryptoAddress: account.cryptoAddress ?? "",
        image1: account.image1 ?? "",
        image2: account.image2 ?? "",
      },
    });
  }

  const sortOptions: { label: string; value: SortMode; icon: keyof typeof Feather.glyphMap }[] = [
    { label: "Recent", value: "recent", icon: "clock" },
    { label: "A-Z", value: "name", icon: "type" },
    { label: "Device", value: "device", icon: "smartphone" },
    { label: "Stars", value: "favorites", icon: "star" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { paddingTop: topInset + 12 }]}> 
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Vault</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}> 
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"} · {filteredAccounts.length} shown
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/account-form");
          }}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={24} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search accounts, email, device, IP..."
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sortRow}>
          {sortOptions.map((option) => {
            const active = sortMode === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setSortMode(option.value)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Feather name={option.icon} size={12} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.sortChipText, { color: active ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}

      {isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={34} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Connection error</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!isLoading && !isError ? (
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item, index) => accountId(item, index)}
          contentContainerStyle={[styles.list, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 16 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "14" }]}> 
                <Feather name={query ? "search" : "users"} size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{query ? "No matching accounts" : "No accounts yet"}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}> 
                {query ? "Try a different search term." : "Add your first account to start browsing privately."}
              </Text>
              {!query ? (
                <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/account-form")} activeOpacity={0.8}>
                  <Feather name="plus" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Add Account</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <AccountCard
              account={item}
              onPress={() => handleOpenBrowser(item)}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
              onToggleFavorite={() => handleToggleFavorite(item)}
            />
          )}
        />
      ) : null}
    </View>
  );
}

const cr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, gap: 8 },
  label: { width: 72, fontSize: 11, fontFamily: "Inter_500Medium" },
  value: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  btns: { flexDirection: "row", gap: 5 },
  btn: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  controls: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  searchBox: { minHeight: 44, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortChip: { flex: 1, minHeight: 34, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  sortChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  cardBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  imgBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  imgBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardUsername: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, maxWidth: 170 },
  badgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  tagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardActions: { flexDirection: "column", gap: 6 },
  actionBtn: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  panel: { paddingHorizontal: 16, paddingBottom: 8, borderTopWidth: 1 },
  imagesPanel: { marginTop: 8, paddingTop: 8 },
  imagesPanelLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8 },
  imagesRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 10, borderWidth: 1 },
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

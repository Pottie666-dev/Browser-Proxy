import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import {
  useCreateAccount,
  useUpdateAccount,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";

const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com"];
const NATURE_WORDS = [
  "rock","tree","river","cloud","stone","leaf","fire","snow","wind","lake",
  "moon","wave","peak","oak","fog","ash","vale","bay","cove","reef","dusk",
  "tide","pine","fern","moss","gust","haze","crag","mist",
];

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateEmail(name: string, surname: string) {
  const f = slugify(name), s = slugify(surname);
  if (!f || !s) return "";
  const fi = f.charAt(0), domain = pick(EMAIL_DOMAINS);
  const sfx = Math.random() < 0.5 ? String(randInt(10, 99)) : String(randInt(1980, 2005));
  return pick([
    `${f}.${s}@${domain}`,`${f}${s}@${domain}`,`${fi}.${s}@${domain}`,
    `${f}_${s}@${domain}`,`${f}.${s}${sfx}@${domain}`,
    `${f}${s}${sfx}@${domain}`,`${fi}${s}${sfx}@${domain}`,
  ]);
}

function generateUsername(name: string, surname: string) {
  const f = slugify(name), s = slugify(surname);
  if (!f || !s) return "";
  const fi = f.charAt(0), si = s.charAt(0);
  const num = randInt(10, 9999);
  const patterns = [
    `${fi}${s}${num}`,
    `${f}${si}${num}`,
    `${f}.${s}${randInt(1, 99)}`,
    `${s}.${f}${randInt(1, 99)}`,
    `${fi}${si}${randInt(100,9999)}`,
    `${f}_${s.slice(0,4)}${randInt(10,99)}`,
    `${s}${f.charAt(0)}${randInt(10,999)}`,
    `${f.slice(0,3)}${s.slice(0,3)}${randInt(10,99)}`,
  ];
  return pick(patterns);
}

function generatePassword(name: string, surname: string, idNumber: string) {
  const f = slugify(name), s = slugify(surname), id = slugify(idNumber);
  if (!s) return "";
  const part = s.slice(0, randInt(3, Math.min(5, s.length)));
  const idPart = id ? id.slice(0, randInt(2, Math.min(4, id.length))) : "";
  const num = randInt(10, 999);
  const word = pick(NATURE_WORDS);
  const base = Math.random() < 0.4
    ? `${part.charAt(0).toUpperCase()}${part.slice(1)}${num}${word}`
    : `${part}${num}${word}`;
  return idPart ? `${base}${idPart}` : base;
}

function generateWalletName(surname: string) {
  const s = slugify(surname);
  if (!s) return "";
  return `${s.slice(0, randInt(2, Math.min(4, s.length)))}${pick(NATURE_WORDS)}${randInt(100, 9999)}`;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[sec.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[sec.label, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 10 },
});

function FieldRow({
  icon, placeholder, value, onChangeText,
  secure, show, onToggleShow, onRegen, canRegen,
  error, keyboardType, autoCapitalize, hint,
}: {
  icon: string; placeholder: string; value: string;
  onChangeText: (t: string) => void;
  secure?: boolean; show?: boolean; onToggleShow?: () => void;
  onRegen?: () => void; canRegen?: boolean;
  error?: string; keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words"; hint?: string;
}) {
  const colors = useColors();
  return (
    <View>
      <View style={fr.row}>
        <Feather name={icon as any} size={16} color={colors.mutedForeground} style={fr.icon as any} />
        <TextInput
          style={[fr.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure && !show}
          autoCapitalize={autoCapitalize ?? "none"}
          keyboardType={keyboardType ?? "default"}
          autoComplete="off"
        />
        {secure && onToggleShow && (
          <TouchableOpacity onPress={onToggleShow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name={show ? "eye-off" : "eye"} size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        {canRegen && onRegen && (
          <TouchableOpacity onPress={onRegen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[fr.regen, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="refresh-cw" size={13} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      {hint ? (
        <View style={[fr.hint, { backgroundColor: colors.primary + "10" }]}>
          <Feather name="zap" size={11} color={colors.primary} />
          <Text style={[fr.hintText, { color: colors.primary }]}>{hint}</Text>
        </View>
      ) : null}
      {error ? <Text style={[fr.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}
const fr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 10 },
  icon: { width: 22 },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  regen: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  hint: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, marginTop: 2, marginLeft: 32, marginBottom: 4 },
  hintText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  error: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, marginLeft: 32, marginBottom: 4 },
});

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 32, marginVertical: 2 }} />;
}

async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.55,
    base64: true,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
}

function ImageSlot({ label, value, onPick, onClear }: { label: string; value: string | null; onPick: () => void; onClear: () => void }) {
  const colors = useColors();
  return (
    <View style={is.wrap}>
      <Text style={[is.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Pressable
        style={({ pressed }) => [is.slot, { borderColor: value ? colors.primary : colors.border, backgroundColor: value ? "transparent" : colors.muted, opacity: pressed ? 0.8 : 1 }]}
        onPress={onPick}
      >
        {value ? <Image source={{ uri: value }} style={is.preview} resizeMode="cover" /> : (
          <View style={is.empty}>
            <Feather name="image" size={22} color={colors.mutedForeground} />
            <Text style={[is.emptyText, { color: colors.mutedForeground }]}>Tap to add</Text>
          </View>
        )}
      </Pressable>
      {value && (
        <TouchableOpacity style={[is.clearBtn, { backgroundColor: colors.destructive + "18" }]} onPress={onClear}>
          <Feather name="x" size={12} color={colors.destructive} />
          <Text style={[is.clearText, { color: colors.destructive }]}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const is = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", gap: 6 },
  label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  slot: { width: 110, height: 110, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  preview: { width: "100%", height: "100%" },
  empty: { alignItems: "center", gap: 5 },
  emptyText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  clearText: { fontSize: 10, fontFamily: "Inter_500Medium" },
});

export default function AccountFormScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    accountId?: string; name?: string; surname?: string;
    email?: string; password?: string; walletName?: string;
    username?: string; idNumber?: string; cryptoAddress?: string;
    image1?: string; image2?: string;
  }>();
  const isEdit = !!params.accountId;

  const [name, setName] = useState(params.name ?? "");
  const [surname, setSurname] = useState(params.surname ?? "");
  const [idNumber, setIdNumber] = useState(params.idNumber ?? "");
  const [username, setUsername] = useState(params.username ?? "");
  const [password, setPassword] = useState(params.password ?? "");
  const [email, setEmail] = useState(params.email ?? "");
  const [cryptoAddress, setCryptoAddress] = useState(params.cryptoAddress ?? "");
  const [walletName] = useState(params.walletName ?? "");
  const [image1, setImage1] = useState<string | null>(params.image1 || null);
  const [image2, setImage2] = useState<string | null>(params.image2 || null);

  const [usernameManual, setUsernameManual] = useState(isEdit);
  const [passwordManual, setPasswordManual] = useState(isEdit);
  const [emailManual, setEmailManual] = useState(isEdit);

  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const isLoading = createAccount.isPending || updateAccount.isPending;

  useEffect(() => {
    if (!usernameManual && name && surname) setUsername(generateUsername(name, surname));
  }, [name, surname, usernameManual]);

  useEffect(() => {
    if (!passwordManual && surname) setPassword(generatePassword(name, surname, idNumber));
  }, [name, surname, idNumber, passwordManual]);

  useEffect(() => {
    if (!emailManual && name && surname) setEmail(generateEmail(name, surname));
  }, [name, surname, emailManual]);

  async function handlePickImage(slot: 1 | 2) {
    const uri = await pickImage();
    if (uri) { slot === 1 ? setImage1(uri) : setImage2(uri); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e["name"] = "First name is required";
    if (!surname.trim()) e["surname"] = "Last name is required";
    if (!idNumber.trim()) e["idNumber"] = "ID number is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    const payload = {
      name: name.trim(),
      surname: surname.trim(),
      email: email.trim() || generateEmail(name, surname) || undefined,
      password: password.trim() || generatePassword(name, surname, idNumber),
      walletName: walletName.trim() || generateWalletName(surname),
      username: username.trim() || null,
      idNumber: idNumber.trim() || null,
      cryptoAddress: cryptoAddress.trim() || null,
      image1: image1 ?? null,
      image2: image2 ?? null,
    };

    if (isEdit && params.accountId) {
      updateAccount.mutate(
        { id: params.accountId, data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); } }
      );
    } else {
      createAccount.mutate(
        { data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); } }
      );
    }
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isEdit ? "Edit Account" : "New Account"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* IDENTITY */}
        <Section label="IDENTITY">
          <FieldRow
            icon="user" placeholder="First name"
            value={name}
            onChangeText={(t) => { setName(t); if (errors["name"]) setErrors(e => ({ ...e, name: "" })); }}
            autoCapitalize="words"
            error={errors["name"]}
          />
          <Divider />
          <FieldRow
            icon="user" placeholder="Last name"
            value={surname}
            onChangeText={(t) => { setSurname(t); if (errors["surname"]) setErrors(e => ({ ...e, surname: "" })); }}
            autoCapitalize="words"
            error={errors["surname"]}
          />
        </Section>

        {/* ONLINE PROFILE */}
        <Section label="ONLINE PROFILE">
          <FieldRow
            icon="at-sign"
            placeholder={name && surname ? "Auto-generated username" : "Enter name first"}
            value={username}
            onChangeText={(t) => { setUsername(t); setUsernameManual(true); }}
            canRegen={!!(name && surname)}
            onRegen={() => { setUsername(generateUsername(name, surname)); setUsernameManual(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            hint={!isEdit && name && surname && username ? "Auto-generated from name — tap ↺ to shuffle" : undefined}
          />
          <Divider />
          <FieldRow
            icon="lock"
            placeholder={surname ? "Auto-generated password" : "Enter last name first"}
            value={password}
            onChangeText={(t) => { setPassword(t); setPasswordManual(true); }}
            secure show={showPw} onToggleShow={() => setShowPw(v => !v)}
            canRegen={!!surname}
            onRegen={() => { setPassword(generatePassword(name, surname, idNumber)); setPasswordManual(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            hint={!isEdit && surname && password && !showPw ? "Auto-generated — tap ↺ to shuffle" : undefined}
          />
        </Section>

        {/* IDENTITY DOCUMENT */}
        <Section label="IDENTITY DOCUMENT">
          <FieldRow
            icon="credit-card" placeholder="ID number"
            value={idNumber}
            onChangeText={(t) => { setIdNumber(t); if (errors["idNumber"]) setErrors(e => ({ ...e, idNumber: "" })); }}
            error={errors["idNumber"]}
          />
          <Divider />
          <FieldRow
            icon="mail"
            placeholder={name && surname ? "Auto-generated email" : "Enter name first"}
            value={email}
            onChangeText={(t) => { setEmail(t); setEmailManual(true); }}
            keyboardType="email-address"
            canRegen={!!(name && surname)}
            onRegen={() => { setEmail(generateEmail(name, surname)); setEmailManual(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          />
        </Section>

        {/* CRYPTO */}
        <Section label="CRYPTO WALLET">
          <FieldRow
            icon="dollar-sign" placeholder="Paste wallet address (BTC, ETH, DOGE…)"
            value={cryptoAddress} onChangeText={setCryptoAddress}
          />
        </Section>

        {/* IMAGES */}
        <Section label="STORED IMAGES">
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17, marginBottom: 14 }}>
            Attach up to 2 images (ID, profile photo) — accessible in the browser when filling forms.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-around", gap: 12 }}>
            <ImageSlot label="IMAGE 1" value={image1} onPick={() => handlePickImage(1)} onClear={() => setImage1(null)} />
            <ImageSlot label="IMAGE 2" value={image2} onPick={() => handlePickImage(2)} onClear={() => setImage2(null)} />
          </View>
        </Section>

        {!isEdit && (
          <View style={[styles.infoCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>A device profile and unique spoofed IP will be automatically assigned to this account.</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.primary, opacity: pressed || isLoading ? 0.8 : 1 }]}
          onPress={handleSubmit} disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
            <>
              <Feather name={isEdit ? "check" : "plus"} size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>{isEdit ? "Save Changes" : "Create Account"}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 4 },
  submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

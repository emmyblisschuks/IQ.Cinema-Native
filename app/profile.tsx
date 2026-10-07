// app/profile.tsx

import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ChevronRight, Wallet, LogOut, Film, Camera, Download, Gem, Ticket, Gift, HelpCircle, Settings, Crown } from "lucide-react-native";
import * as Linking from "expo-linking";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/hooks/useI18n";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import type { LucideIcon } from "lucide-react-native";

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function NavRow({ icon, label, onPress, first }: { icon: LucideIcon; label: string; onPress?: () => void; first?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-3.5 active:bg-surface-raised ${first ? "" : "border-t border-border"}`}
    >
      <View className="flex-row items-center gap-2.5">
        <Icon as={icon} size={17} tone="muted" />
        <Text className="text-[14px] text-text">{label}</Text>
      </View>
      <Icon as={ChevronRight} size={16} tone="muted" />
    </Pressable>
  );
}

type HistoryItem = {
  poster_url: string | null;
  title: string;
  slug: string;
  episode_id: string;
  episode_number: number;
  total_episodes: number;
};

function Stat({ icon, tone, value, label, onPress }: { icon: LucideIcon; tone: string; value: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center gap-1">
      <Icon as={icon} size={16} tone={tone} />
      <Text className="font-display text-[16px] font-semibold text-text">{value}</Text>
      <Text className="text-[11px] text-muted">{label}</Text>
    </Pressable>
  );
}

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
  const { wallet } = useWallet(user?.id);
  const [isVip, setIsVip] = useState(false);
  const [couponCount, setCouponCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const [showBecomeCreator, setShowBecomeCreator] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // profile loads asynchronously after useAuth's own fetch — pick up its
  // avatar_url once available instead of only reading it at mount time.
  useEffect(() => {
    if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
  }, [profile?.avatar_url]);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    supabase.rpc("get_membership").then(({ data }) => { if (!ignore) setIsVip(Boolean(data?.active)); });
    supabase
      .from("user_coupons")
      .select("id", { count: "exact", head: true })
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .then(({ count }) => { if (!ignore) setCouponCount(count ?? 0); });
    supabase
      .from("watch_history")
      .select("episode_id, updated_at, titles(title, slug, poster_url, id)")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data || ignore) return;
        const ti = data.titles as unknown as { title: string; slug: string; poster_url: string | null; id: string } | null;
        if (!ti) return;
        const [{ data: ep }, { count: total }] = await Promise.all([
          supabase.from("episodes").select("episode_number").eq("id", data.episode_id).maybeSingle(),
          supabase.from("episodes").select("id", { count: "exact", head: true }).eq("title_id", ti.id).eq("status", "published").gt("episode_number", 0),
        ]);
        if (ignore) return;
        setHistory({
          poster_url: ti.poster_url,
          title: ti.title,
          slug: ti.slug,
          episode_id: data.episode_id as string,
          episode_number: ep?.episode_number ?? 1,
          total_episodes: total ?? 1,
        });
      });
    return () => { ignore = true; };
  }, [user, supabase]);

  async function handleAvatarChange() {
    if (!user) return;
    setAvatarError(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const mime = asset.mimeType ?? "image/jpeg";
    if (!(mime in MIME_EXT)) {
      setAvatarError(t("profile.errImageType"));
      return;
    }
    if ((asset.fileSize ?? 0) > 2 * 1024 * 1024) {
      setAvatarError(t("profile.errImageSize"));
      return;
    }

    setAvatarUploading(true);
    try {
      // Fixed filename per user (not the original name) — upsert overwrites
      // the same object on every change instead of accumulating orphans.
      const path = `${user.id}/avatar.${MIME_EXT[mime]}`;
      const body = await (await fetch(asset.uri)).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, body, { upsert: true, cacheControl: "3600", contentType: mime });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust: the path is stable across uploads, so without this the
      // image cache (and any CDN) would keep serving the previous image.
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl);
    } catch (e) {
      setAvatarError((e as Error).message ?? t("profile.uploadFailed"));
    } finally {
      setAvatarUploading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "become_creator_link")
      .single()
      .then(({ data }) => {
        // Flag missing or unreadable defaults to visible, so a table hiccup
        // never silently hides the link from every user.
        if (mounted && data) setShowBecomeCreator(data.enabled);
      });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) return null;

  if (!user) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <FadeIn style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text className="font-display text-center text-lg text-text">{t("profile.guestTitle")}</Text>
          <Text className="mt-1 text-center text-sm text-muted">{t("profile.guestBody")}</Text>
          <Button className="mt-4" onPress={() => router.push("/auth/login")}>
            {t("profile.signIn")}
          </Button>
        </FadeIn>
      </SafeAreaView>
    );
  }

  const creator = (() => {
    switch (profile?.creator_status) {
      case "none":
        return { href: "/creator/apply", label: t("profile.becomeCreator") };
      case "applied":
        return { href: "/creator/apply", label: t("profile.applicationPending") };
      case "declined":
        return { href: "/creator/apply", label: t("profile.applicationDeclined") };
      case "approved":
      case "partner":
        return { href: "/creator/dashboard", label: t("profile.creatorDashboard") };
      default:
        return { href: "/creator/apply", label: t("profile.becomeCreator") };
    }
  })();
  // Only the initial invite is admin-hideable — a user who already applied,
  // was declined, or is an active creator/partner still needs their own
  // status link and dashboard, regardless of the flag.
  const hideCreatorLink = profile?.creator_status === "none" && !showBecomeCreator;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false}>
        <FadeIn style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 }}>
          <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            <View className="relative shrink-0">
              <Pressable
                onPress={handleAvatarChange}
                disabled={avatarUploading}
                accessibilityLabel={t("profile.changePhoto")}
                className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-raised"
                style={{ opacity: avatarUploading ? 0.7 : 1 }}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56 }} contentFit="cover" />
                ) : (
                  <Text className="font-display text-lg font-semibold text-text">
                    {(profile?.display_name ?? "U")[0]?.toUpperCase()}
                  </Text>
                )}
              </Pressable>
              <View
                pointerEvents="none"
                className="absolute h-5 w-5 items-center justify-center rounded-full border-2 border-bg bg-pink"
                style={{ bottom: -2, right: -2 }}
              >
                <Icon as={Camera} size={11} tone="white" />
              </View>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[16px] font-semibold text-text">{profile?.display_name ?? "—"}</Text>
              <Text className="text-[13px] text-muted">@{profile?.username}</Text>
              {avatarUploading ? <Text className="mt-0.5 text-[11px] text-muted">{t("profile.uploading")}</Text> : null}
              {avatarError ? <Text className="mt-0.5 text-[11px] text-crimson">{avatarError}</Text> : null}
            </View>
          </View>
          <NotificationBell />
          </View>

          {!isVip ? (
            <Pressable
              onPress={() => router.push("/wallet")}
              className="mt-5 overflow-hidden rounded-lg p-4"
              style={({ pressed }) => (pressed ? { opacity: 0.92 } : null)}
            >
              <BrandGradient radius={12} />
              <View className="flex-row items-center gap-1.5">
                <Crown size={16} color="#fff" fill="rgba(255,255,255,0.25)" />
                <Text className="flex-1 text-[14.5px] font-semibold" style={{ color: "#fff" }}>{t("profile.vipTitle")}</Text>
              </View>
              <View className="mt-2.5 flex-row flex-wrap items-center gap-x-4 gap-y-1">
                <Text className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.85)" }}>{t("profile.vipFree")}</Text>
                <Text className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.85)" }}>{t("profile.vipAdFree")}</Text>
                <Text className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.85)" }}>{t("profile.vipDownloads")}</Text>
              </View>
              <View className="mt-3 h-9 items-center justify-center rounded-md" style={{ backgroundColor: "#fff" }}>
                <Text className="text-[13.5px] font-semibold" style={{ color: "rgb(150,45,40)" }}>{t("profile.activate")}</Text>
              </View>
            </Pressable>
          ) : null}

          <View className="mt-4 flex-row items-stretch rounded-lg border border-border bg-surface p-3.5">
            <Stat icon={Wallet} tone="gold" value={wallet ? wallet.coin_balance.toLocaleString() : "—"} label={t("profile.wallet")} onPress={() => router.push("/wallet")} />
            <View className="w-px bg-border" />
            <Stat icon={Gem} tone="pink" value={wallet ? (wallet.points_balance ?? 0).toLocaleString() : "—"} label={t("profile.points")} onPress={() => router.push("/points")} />
            <View className="w-px bg-border" />
            <Stat icon={Ticket} tone="crimson" value={String(couponCount)} label={t("profile.coupons")} onPress={() => router.push("/tickets")} />
          </View>

          {history ? (
            <Pressable
              onPress={() => router.push(`/watch/${history.episode_id}` as never)}
              className="mt-4 flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <View className="h-16 w-11 overflow-hidden rounded-md bg-surface-raised">
                {history.poster_url ? <Image source={{ uri: history.poster_url }} style={{ width: 44, height: 64 }} contentFit="cover" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-[14px] font-medium text-text">{history.title}</Text>
                <Text className="mt-0.5 text-[12px] text-muted">
                  EP.{history.episode_number}/EP.{history.total_episodes || history.episode_number}
                </Text>
              </View>
            </Pressable>
          ) : null}

          <View className="mt-4 overflow-hidden rounded-md border border-border bg-surface">
            <NavRow first icon={Wallet} label={t("profile.topUp")} onPress={() => router.push("/wallet")} />
            <NavRow icon={Gift} label={t("profile.earnRewards")} onPress={() => router.push("/rewards")} />
            <NavRow icon={Ticket} label={t("profile.tickets")} onPress={() => router.push("/tickets")} />
            <NavRow icon={Download} label={t("profile.downloads")} onPress={() => router.push("/downloads")} />
            {!hideCreatorLink ? (
              <NavRow icon={Film} label={creator.label} onPress={() => router.push(creator.href as never)} />
            ) : null}
          </View>

          <View className="mt-4 overflow-hidden rounded-md border border-border bg-surface">
            <NavRow first icon={Settings} label={t("profile.settings")} onPress={() => router.push("/settings")} />
            <NavRow icon={HelpCircle} label={t("profile.help")} onPress={() => { Linking.openURL("mailto:support@iqcinema.app").catch(() => {}); }} />
          </View>

          <Button onPress={handleSignOut} variant="secondary" size="lg" className="mt-5 w-full" textClassName="text-crimson">
            <Icon as={LogOut} size={16} tone="crimson" />
            {t("profile.signOut")}
          </Button>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

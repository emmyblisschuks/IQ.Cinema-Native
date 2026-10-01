// app/profile.tsx

import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ChevronRight, Wallet, Bell, LogOut, Film, Camera, Download } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
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

export default function ProfilePage() {
  const { user, profile, loading } = useAuth();
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
      setAvatarError("Use a JPG, PNG, or WEBP image.");
      return;
    }
    if ((asset.fileSize ?? 0) > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
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
      setAvatarError((e as Error).message ?? "Upload failed.");
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
          <Text className="font-display text-center text-lg text-text">You're browsing as a guest</Text>
          <Text className="mt-1 text-center text-sm text-muted">Sign in to save your library and buy coins.</Text>
          <Button className="mt-4" onPress={() => router.push("/auth/login")}>
            Sign in
          </Button>
        </FadeIn>
      </SafeAreaView>
    );
  }

  const creator = (() => {
    switch (profile?.creator_status) {
      case "none":
        return { href: "/creator/apply", label: "Become a creator" };
      case "applied":
        return { href: "/creator/apply", label: "Application pending" };
      case "declined":
        return { href: "/creator/apply", label: "Application declined — reapply" };
      case "approved":
      case "partner":
        return { href: "/creator/dashboard", label: "Creator dashboard" };
      default:
        return { href: "/creator/apply", label: "Become a creator" };
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
          <View className="flex-row items-center gap-3">
            <View className="relative shrink-0">
              <Pressable
                onPress={handleAvatarChange}
                disabled={avatarUploading}
                accessibilityLabel="Change profile photo"
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
              {avatarUploading ? <Text className="mt-0.5 text-[11px] text-muted">Uploading…</Text> : null}
              {avatarError ? <Text className="mt-0.5 text-[11px] text-crimson">{avatarError}</Text> : null}
            </View>
          </View>

          <View className="mt-6 flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
            <Text className="text-[14px] text-text">Appearance</Text>
            <ThemeToggle />
          </View>

          <View className="mt-4 overflow-hidden rounded-md border border-border bg-surface">
            <NavRow first icon={Wallet} label="Wallet & subscriptions" onPress={() => router.push("/wallet")} />
            {!hideCreatorLink ? (
              <NavRow icon={Film} label={creator.label} onPress={() => router.push(creator.href as never)} />
            ) : null}
            <NavRow icon={Bell} label="Notifications" />
          </View>

          <Button onPress={handleSignOut} variant="secondary" size="lg" className="mt-5 w-full" textClassName="text-crimson">
            <Icon as={LogOut} size={16} tone="crimson" />
            Sign out
          </Button>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text, TextInput } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { useI18n } from "@/hooks/useI18n";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null; username: string; avatar_url: string | null } | null;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CommentsSheet({
  open,
  onClose,
  episodeId,
  count,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  count: number;
  onCountChange: (next: number) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const supabase = createClient();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("episode_comments")
      .select("id, body, created_at, user_id, profiles(display_name, username, avatar_url)")
      .eq("episode_id", episodeId)
      .order("created_at", { ascending: false })
      .limit(50);
    setComments((data as unknown as Comment[]) ?? []);
  }, [episodeId, supabase]);

  // Re-fetch every time the sheet opens rather than once on mount — the count
  // (and comment list) may have changed while it was closed, e.g. after a
  // swipe to another episode and back.
  useEffect(() => {
    if (open) {
      setComments(null);
      load();
    }
  }, [open, load]);

  async function submit() {
    const body = draft.trim();
    if (!body || !user || posting) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("episode_comments")
      .insert({ episode_id: episodeId, user_id: user.id, body })
      .select("id, body, created_at, user_id, profiles(display_name, username, avatar_url)")
      .single();
    setPosting(false);
    if (!error && data) {
      setComments((prev) => [data as unknown as Comment, ...(prev ?? [])]);
      setDraft("");
      onCountChange(count + 1);
    }
  }

  const canPost = !!user && !!draft.trim() && !posting;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`${count.toLocaleString()} comments`}
      footer={
        <View
          className="flex-row items-center gap-2 border-t border-border bg-surface px-4 pt-2.5"
          style={{ paddingBottom: 10 }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="send"
            maxLength={500}
            placeholder={user ? t("watch.addComment") : t("watch.signInToComment")}
            editable={!!user}
            className="h-10 flex-1 rounded-full border border-border bg-surface-raised px-4 text-[14px] text-text"
            style={{ opacity: user ? 1 : 0.6 }}
          />
          <Pressable
            onPress={submit}
            disabled={!canPost}
            accessibilityLabel={t("watch.postComment")}
            className="h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{ opacity: canPost ? 1 : 0.4 }}
          >
            <BrandGradient radius={20} />
            <Icon as={Send} size={16} tone="white" />
          </Pressable>
        </View>
      }
    >
      <View className="gap-3 px-3 pb-2 pt-1">
        {comments === null ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />) : null}

        {comments !== null && comments.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted">{t("watch.noComments")}</Text>
        ) : null}

        {comments?.map((c) => (
          <View key={c.id} className="flex-row gap-2.5">
            <View className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-raised">
              {c.profiles?.avatar_url ? (
                <Image source={{ uri: c.profiles.avatar_url }} style={{ width: 32, height: 32 }} contentFit="cover" />
              ) : null}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-semibold text-text">
                {c.profiles?.display_name || c.profiles?.username || t("watch.viewer")}
                <Text className="ml-2 font-normal text-muted">{`  ${timeAgo(c.created_at)}`}</Text>
              </Text>
              <Text className="mt-0.5 text-[14px] text-text/90">{c.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

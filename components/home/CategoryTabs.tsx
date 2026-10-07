import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import clsx from "clsx";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

const staticTabs = [
  { key: "popular", labelKey: "home.popular" },
  { key: "new", labelKey: "home.new" },
  { key: "ranking", labelKey: "home.ranking" },
] as const;

export function CategoryTabs({
  activeTab,
  activeGenre,
  genres,
}: {
  activeTab: string;
  activeGenre?: string;
  genres: string[];
}) {
  const { t, genre: genreLabel } = useI18n();
  const router = useRouter();
  const isGenreActive = activeTab === "genre";
  const [open, setOpen] = useState(false);

  // Tab changes rewrite the route params in place (no history entry per tab).
  function go(params: { tab?: string; genre?: string }) {
    router.setParams({ tab: params.tab, genre: params.genre });
  }

  return (
    <View className="flex-row items-center gap-5 px-4 pt-4">
      {staticTabs.map(({ key, labelKey }) => {
        const active = activeTab === key;
        return (
          <Pressable key={key} onPress={() => go({ tab: key === "popular" ? undefined : key, genre: undefined })}>
            <Text
              className={clsx(
                "text-[16px] font-extrabold uppercase tracking-wide",
                active ? "text-text" : "text-muted"
              )}
            >
              {t(labelKey)}
            </Text>
          </Pressable>
        );
      })}

      <Pressable onPress={() => setOpen(true)} className="ml-auto flex-row items-center gap-1">
        <Text
          className={clsx(
            "text-[16px] font-extrabold uppercase tracking-wide",
            isGenreActive ? "text-text" : "text-muted"
          )}
        >
          {t("home.genres")}
        </Text>
        <Icon as={ChevronDown} size={17} strokeWidth={3} tone={isGenreActive ? "text" : "muted"} />
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("home.genres")}>
        <View className="pb-1">
          {genres.map((genre) => (
            <Pressable
              key={genre}
              onPress={() => {
                setOpen(false);
                go({ tab: "genre", genre });
              }}
              className="mx-2 rounded-md px-3.5 py-3 active:bg-surface-raised"
            >
              <Text
                className={clsx(
                  "text-[15px]",
                  isGenreActive && activeGenre === genre ? "font-semibold text-pink" : "text-text"
                )}
              >
                {genreLabel(genre)}
              </Text>
            </Pressable>
          ))}
          {!genres.length && <Text className="px-5 py-3 text-sm text-muted">{t("home.noGenres")}</Text>}
        </View>
      </BottomSheet>
    </View>
  );
}

// components/shared/BottomNav.tsx

import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import clsx from "clsx";
import { HomeIcon, ForYouIcon, MyListIcon, RewardsIcon, ProfileIcon } from "./NavIcons";
import { Text } from "@/components/ui/Text";
import { Pop } from "@/components/ui/Pop";
import { useTheme } from "@/hooks/useTheme";

const items = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/for-you", label: "For You", icon: ForYouIcon },
  { href: "/library", label: "My List", icon: MyListIcon },
  { href: "/rewards", label: "Rewards", icon: RewardsIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const hideOn = ["/watch/", "/auth/"];
  if (hideOn.some((p) => pathname.startsWith(p))) return null;

  const activeIndex = items.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
  );

  return (
    <View
      className="w-full border-t border-border bg-surface"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="w-full max-w-md flex-row items-stretch justify-between self-center px-1">
        {items.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          const color = active ? colors.pink : colors.muted;
          return (
            <Pressable
              key={href}
              onPress={() => router.navigate(href)}
              className="flex-1 items-center gap-0.5 rounded-md py-2"
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Pop active={active}>
                <Icon width={28} height={28} color={color} />
              </Pop>
              <Text
                className={clsx("text-[11.5px] font-bold tracking-tight", active ? "text-pink" : "text-muted")}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

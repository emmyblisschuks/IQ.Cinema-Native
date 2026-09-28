import { View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/hooks/useTheme";
import { rgba } from "@/lib/theme";

function Cup() {
  const { colors, tokens } = useTheme();
  const c = colors.muted;
  const pink = tokens["--pink"];
  const gold = tokens["--gold"];
  return (
    <Svg width={160} height={128} viewBox="0 0 160 130" fill="none" accessibilityElementsHidden>
      <Path d="M62 30c-5-7 4-11-1-18" stroke={c} strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
      <Path d="M80 27c-5-8 4-12-1-21" stroke={c} strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
      <Ellipse cx={80} cy={100} rx={54} ry={15} stroke={c} strokeWidth={1.6} />
      <Ellipse cx={80} cy={100} rx={38} ry={9} stroke={c} strokeWidth={1.2} opacity={0.5} />
      <Path d="M40 50c0 27 16 46 40 46s40-19 40-46" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      <Ellipse cx={80} cy={50} rx={40} ry={11} stroke={c} strokeWidth={1.6} />
      <Ellipse cx={80} cy={51} rx={30} ry={7} fill={rgba(pink, 0.4)} />
      <Path d="M119 56c13-2 19 5 14 13-3 6-11 8-19 8" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={24} cy={72} r={5} fill={rgba(pink, 0.35)} />
      <Circle cx={140} cy={38} r={6} fill={rgba(gold, 0.55)} />
      <Circle cx={132} cy={92} r={2.5} fill={rgba(pink, 0.5)} />
    </Svg>
  );
}

export function EmptyState({
  message = "Go to the homepage to discover more content.",
  actionLabel = "Discover More",
  href = "/",
}: {
  message?: string;
  actionLabel?: string;
  href?: string;
}) {
  const router = useRouter();
  return (
    <FadeIn>
      <View className="items-center px-8 pt-16">
        <Cup />
        <Text className="mt-6 max-w-[16rem] text-center text-[17px] leading-snug text-muted">{message}</Text>
        <Button size="lg" className="mt-6" style={{ minWidth: 208 }} onPress={() => router.push(href as never)}>
          {actionLabel}
        </Button>
      </View>
    </FadeIn>
  );
}

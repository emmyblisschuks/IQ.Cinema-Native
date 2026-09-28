import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

// Native equivalent of the web `.coin-pop` keyframes (1 → 1.18 → 1 over
// 320ms). Plays each time `active` flips to true, or whenever `trigger`
// changes while active.
export function Pop({
  active,
  trigger,
  children,
  style,
}: {
  active: boolean;
  trigger?: unknown;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.18, duration: 128, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
    ]).start();
  }, [active, trigger, scale]);

  return <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>;
}

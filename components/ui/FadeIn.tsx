import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

// Native equivalent of the web `.fade-in` (200ms opacity ease-out). Remount
// with a `key` to replay it, like the web does when switching home tabs.
export function FadeIn({ children, style, duration = 200 }: { children: ReactNode; style?: StyleProp<ViewStyle>; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [opacity, duration]);
  return <Animated.View style={[{ opacity }, style]}>{children}</Animated.View>;
}

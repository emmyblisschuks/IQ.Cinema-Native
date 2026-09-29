import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

// Native version of the web `.pulse-glow`: a soft ring that expands and fades
// from behind an icon every 2.4s. Box-shadow can't be animated on the native
// driver, so a scaled/fading ring view stands in (same look, no layout work).
// Skipped entirely when the OS asks for reduced motion.
export function PulseGlow({ color, size, children }: { color: string; size: number; children: ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.timing(t, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true })
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [t]);

  const scale = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1 + 18 / size, 1 + 18 / size] });
  const opacity = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.35, 0, 0] });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      {children}
    </View>
  );
}

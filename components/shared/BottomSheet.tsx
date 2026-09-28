import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";

// On web, links inside a sheet call markSheetNavigating() so the sheet's own
// history entry is swapped instead of popped. Native sheets are Modals with
// no history entry, so this is kept as a no-op purely so call sites port 1:1.
export function markSheetNavigating() {}

// Drag-to-dismiss bottom sheet. Dismisses on a fast downward flick OR when
// dragged past a third of its own height — same rule as the web sheet. The
// Android hardware Back button closes it (Modal.onRequestClose).
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const y = useRef(new Animated.Value(screenH)).current;
  const sheetH = useRef(300);
  const closing = useRef(false);

  useEffect(() => {
    if (open) {
      closing.current = false;
      setVisible(true);
      y.setValue(screenH);
      Animated.timing(y, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (visible) {
      Animated.timing(y, { toValue: screenH, duration: 200, useNativeDriver: true }).start(() =>
        setVisible(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function runClose() {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(y, { toValue: screenH, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
    });
  }
  const runCloseRef = useRef(runClose);
  runCloseRef.current = runClose;

  // Only the handle/header starts a drag, so scrolling and taps on the
  // content inside the sheet are never hijacked.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.vy > 0.5 || g.dy > sheetH.current / 3) runCloseRef.current();
          else Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
      }),
    [y]
  );

  if (!visible) return null;

  const backdropOpacity = y.interpolate({
    inputRange: [0, screenH],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={runClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", opacity: backdropOpacity }}
        />
        <Pressable onPress={runClose} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
        <Animated.View
          onLayout={(e) => (sheetH.current = e.nativeEvent.layout.height)}
          className="w-full max-w-md self-center rounded-t-xl border-t border-border bg-surface"
          style={{
            transform: [{ translateY: y }],
            paddingBottom: insets.bottom,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -8 },
            elevation: 16,
          }}
        >
          <View {...pan.panHandlers} className="items-center pb-1 pt-2.5">
            <View className="h-1 w-9 rounded-full bg-border" />
            {title ? <Text className="mt-2 pb-1 text-[15px] font-semibold text-text">{title}</Text> : null}
          </View>
          <ScrollView style={{ maxHeight: screenH * 0.7 }} contentContainerClassName="px-1 pb-2" bounces={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

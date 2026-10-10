// components/shared/SwipePager.tsx
//
// TikTok-style vertical pager used by the watch feed and the For You feed.
//
//  • The page follows the finger: the next (or previous) video slides in under
//    your thumb instead of the screen reloading after the swipe.
//  • Only three slides exist at any moment (previous, current, next), so only
//    the current one ever plays a video; the neighbours are static frames.
//  • `loop` makes it circular: swipe up on the last item and the first one
//    slides in; swipe down on the first and the last one slides in.
//
// The pager is controlled: the parent owns `activeId`, the pager only asks to
// change it (onChange) once a swipe has been committed.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// How far (as a share of the screen) a drag must travel to commit...
const COMMIT_DISTANCE = 0.18;
// ...or how fast a flick must be (px per ms; gesture-handler reports px/s).
const COMMIT_VELOCITY = 0.45;
const SLIDE_MS = 240;

export type SwipePagerProps<T> = {
  items: T[];
  idOf: (item: T) => string;
  activeId: string | null;
  onChange: (id: string) => void;
  // Wrap around at both ends (needs 2+ items).
  loop: boolean;
  // Height of one page (the visible area).
  height: number;
  // Sheets / modals open on top: leave gestures alone.
  disabled?: boolean;
  // Bump this number to slide to the next item programmatically (autoplay).
  advanceKey?: number;
  renderSlide: (item: T, state: { active: boolean }) => ReactNode;
};

export function SwipePager<T>({ items, idOf, activeId, onChange, loop, height, disabled, advanceKey, renderSlide }: SwipePagerProps<T>) {
  const n = items.length;
  const found = activeId ? items.findIndex((i) => idOf(i) === activeId) : -1;
  const idx = found >= 0 ? found : 0;

  const canWrap = loop && n > 1;
  const neighbour = useCallback(
    (from: number, dir: 1 | -1): number | null => {
      if (n < 2) return null;
      const to = from + dir;
      if (to >= 0 && to < n) return to;
      return canWrap ? (to + n) % n : null;
    },
    [n, canWrap]
  );

  const prevIdx = neighbour(idx, -1);
  const nextIdx = neighbour(idx, 1);

  const translateY = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);

  // The pan responder is created once, so it reads everything it needs from a
  // ref that is refreshed on every render.
  const live = useRef({ items, idOf, idx, prevIdx, nextIdx, height, disabled: !!disabled, onChange });
  live.current = { items, idOf, idx, prevIdx, nextIdx, height, disabled: !!disabled, onChange };

  // A swipe was committed: the page stays parked one screen away until the
  // parent has re-rendered with the new active item, then snaps back to centre
  // in the same frame — the new current slide is already sitting in the middle.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    translateY.setValue(0);
    animating.current = false;
  }, [activeId, translateY]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const springBack = useCallback(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  }, [translateY]);

  // Slide one page up (dir = 1, next item) or down (dir = -1, previous item).
  const commit = useCallback(
    (dir: 1 | -1) => {
      const { prevIdx: p, nextIdx: nx, height: h, items: list, idOf: id, onChange: change } = live.current;
      const target = dir === 1 ? nx : p;
      if (target === null || animating.current) {
        springBack();
        return;
      }
      animating.current = true;
      Animated.timing(translateY, {
        toValue: dir === 1 ? -h : h,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          // Interrupted: never leave the pager locked.
          animating.current = false;
          return;
        }
        change(id(list[target]));
        // Safety net: if the parent declined the change, come back.
        settleTimer.current = setTimeout(() => {
          translateY.setValue(0);
          animating.current = false;
        }, 600);
      });
    },
    [translateY, springBack]
  );

  // The drag is a react-native-gesture-handler Pan rather than a PanResponder.
  // A PanResponder has to win a negotiation with every Pressable / scrub bar
  // inside the video (and keeps stale dx/dy when it loses one), so swipes were
  // easily swallowed. A native Pan only activates once the finger has moved
  // 10px vertically (and fails on mostly-horizontal moves), and when it does
  // it cancels whatever tap was in progress underneath — taps still work.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(!disabled)
        .activeOffsetY([-10, 10])
        .failOffsetX([-30, 30])
        .onUpdate((e) => {
          if (animating.current) return;
          const { prevIdx: p, nextIdx: nx } = live.current;
          let dy = e.translationY;
          // Nothing in that direction → rubber-band.
          if (dy < 0 && nx === null) dy *= 0.25;
          if (dy > 0 && p === null) dy *= 0.25;
          translateY.setValue(dy);
        })
        .onEnd((e) => {
          if (animating.current) return;
          const h = live.current.height;
          const vy = e.velocityY / 1000; // px per ms
          const up = e.translationY < -h * COMMIT_DISTANCE || vy < -COMMIT_VELOCITY;
          const down = e.translationY > h * COMMIT_DISTANCE || vy > COMMIT_VELOCITY;
          if (up) commit(1);
          else if (down) commit(-1);
          else springBack();
        })
        .onFinalize((_e, success) => {
          // Cancelled (e.g. a system gesture took over): never leave the page
          // stranded half-way.
          if (!success && !animating.current) springBack();
        }),
    [disabled, translateY, springBack, commit]
  );

  // Programmatic "go to next" (e.g. the video ended).
  const lastAdvance = useRef(advanceKey ?? 0);
  useEffect(() => {
    if (advanceKey === undefined || advanceKey === lastAdvance.current) return;
    lastAdvance.current = advanceKey;
    if (!live.current.disabled) commit(1);
  }, [advanceKey, commit]);

  if (!n || height <= 0) return null;

  // Duplicate ids can only happen with exactly two looping items (previous and
  // next are the same video) — give those cells distinct keys.
  const slots: { key: string; index: number | null; top: number; active: boolean }[] = [
    { key: prevIdx !== null && prevIdx === nextIdx ? `${idOf(items[prevIdx])}:prev` : prevIdx !== null ? idOf(items[prevIdx]) : "prev-empty", index: prevIdx, top: 0, active: false },
    { key: idOf(items[idx]), index: idx, top: height, active: true },
    { key: nextIdx !== null ? idOf(items[nextIdx]) : "next-empty", index: nextIdx, top: height * 2, active: false },
  ];

  return (
    <GestureDetector gesture={pan}>
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: "#000" }}>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -height,
          height: height * 3,
          transform: [{ translateY }],
        }}
      >
        {slots.map((s) => (
          <View key={s.key} style={{ position: "absolute", left: 0, right: 0, top: s.top, height, backgroundColor: "#000" }}>
            {s.index !== null ? renderSlide(items[s.index], { active: s.active }) : null}
          </View>
        ))}
      </Animated.View>
    </View>
    </GestureDetector>
  );
}

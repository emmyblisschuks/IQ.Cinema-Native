import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

// The coin balance otherwise jumps silently from one number to the next.
// This eases the displayed number toward the real value and flags `changed`
// for the duration, so callers can pair it with a pop/glow.
//
// Pass `null`/`undefined` while still loading. The first REAL value snaps
// into place with no animation; only changes after that animate.
export function useAnimatedNumber(target: number | null | undefined, durationMs = 700) {
  const [display, setDisplay] = useState(target ?? 0);
  const [changed, setChanged] = useState(false);
  const lastTargetRef = useRef<number | null>(null); // null until the first real value
  const shownRef = useRef(target ?? 0); // what's actually on screen right now
  const rafRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotionRef.current = v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      reduceMotionRef.current = v;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (target == null) return; // still loading — not a value yet

    const show = (n: number) => {
      shownRef.current = n;
      setDisplay(n);
    };

    // First real value: snap, don't animate.
    if (lastTargetRef.current === null) {
      lastTargetRef.current = target;
      show(target);
      return;
    }
    if (target === lastTargetRef.current) return;
    lastTargetRef.current = target;

    if (reduceMotionRef.current) {
      show(target);
      return;
    }

    // Start from whatever is on screen right now, so a second change landing
    // mid-animation continues smoothly.
    const from = shownRef.current;
    const delta = target - from;
    const start = performance.now();
    setChanged(true);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      show(Math.round(from + delta * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setChanged(false);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return { display, changed };
}

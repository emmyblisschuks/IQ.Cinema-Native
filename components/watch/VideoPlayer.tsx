// components/watch/VideoPlayer.tsx

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play, Pause, RotateCcw, RotateCw } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { Pop } from "@/components/ui/Pop";
import { Scrim } from "@/components/ui/Scrim";
import { SB_FRAME_H, SB_FRAME_W, storyboardLayout } from "@/lib/storyboard";

const AUTO_HIDE_MS = 3000;
const DOUBLE_TAP_MS = 280;
const SEEK_SECONDS = 10;
const PREVIEW_W = 90;
const PREVIEW_H = 160;
const STALL_MS = 8000;
const MAX_RECOVERIES = 2;
const BAR_HEIGHT = 24; // h-6 touch target

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Fades a control layer in/out (200ms) and stops it eating touches while
// hidden — the native counterpart of `transition-opacity` + `pointer-events-none`.
function FadeLayer({ visible, style, children }: { visible: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [visible, opacity]);
  return (
    <Animated.View pointerEvents={visible ? "box-none" : "none"} style={[{ opacity }, style]}>
      {children}
    </Animated.View>
  );
}

const shadow = { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 } as const;

export function VideoPlayer({
  src,
  autoPlay,
  speed = 1,
  posterUrl,
  title,
  synopsis,
  onOpenDetails,
  actionRail,
  topBar,
  onTimeUpdate,
  onEnded,
  onRequestFreshSrc,
  storyboardUrl,
}: {
  src: string | undefined;
  autoPlay?: boolean;
  // Applied to the player as playbackRate — the Speed sheet in the top bar
  // controls this from the parent so it survives across re-renders.
  speed?: number;
  posterUrl?: string;
  // Title (without the episode prefix — EP.N lives in the top bar) and a short
  // synopsis, shown in the bottom overlay together with the rest of the controls.
  title?: string;
  synopsis?: string | null;
  onOpenDetails?: () => void;
  // Given the distance (px) from the bottom edge at which the rail should sit
  // so its Episodes icon lines up with the title.
  actionRail?: ReactNode | ((railBottom: number) => ReactNode);
  topBar?: ReactNode;
  onTimeUpdate?: (seconds: number) => void;
  onEnded?: () => void;
  // Returns a brand-new (e.g. re-signed) URL; used to recover a stalled or
  // expired stream.
  onRequestFreshSrc?: () => Promise<string | undefined>;
  // One JPEG sprite sheet of preview frames (see lib/storyboard.ts).
  storyboardUrl?: string | null;
}) {
  const insets = useSafeAreaInsets();

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.bufferOptions = { ...p.bufferOptions, preferredForwardBufferDuration: 20 };
  });

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSide = useRef<"left" | "right" | null>(null);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const scrubTimeRef = useRef(0);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveries = useRef(0);
  const recovering = useRef(false);
  const stallStage = useRef(0);
  const pendingSeek = useRef<number | null>(null);
  const currentSrc = useRef<string | undefined>(undefined);
  const durationRef = useRef(0);
  const lastTick = useRef({ t: -1, at: 0 });

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [iconPulse, setIconPulse] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [clock, setClock] = useState(0);
  const [spriteReady, setSpriteReady] = useState(false);
  // Keyed by a counter so re-tapping the same side while the flash is
  // mid-animation restarts it instead of being ignored.
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right"; key: number } | null>(null);
  const [barW, setBarW] = useState(0);
  const [panelH, setPanelH] = useState(0);
  const [blockH, setBlockH] = useState(0);
  const [titleH, setTitleH] = useState(0);

  // 0..1 progress, driven natively (fill + thumb are transforms, so a 4Hz
  // playhead never triggers a layout pass — same intent as the web version
  // writing straight to the DOM).
  const progress = useRef(new Animated.Value(0)).current;
  const barWRef = useRef(0);
  const barX = useRef(0);
  const barRef = useRef<View>(null);
  const grow = useRef(new Animated.Value(0)).current; // 0 idle → 1 dragging (bar/thumb size)

  const setProgressUI = useCallback(
    (current: number, total: number) => {
      const p = total ? Math.min(1, Math.max(0, current / total)) : 0;
      progress.setValue(p);
      setClock(Math.floor(current));
    },
    [progress]
  );

  // ------------------------------------------------------------- source ----
  useEffect(() => {
    if (!src || src === currentSrc.current) return;
    currentSrc.current = src;
    setBuffering(true);
    player.replaceAsync(src).then(() => {
      if (autoPlay) player.play();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, player]);

  // Keep the player's rate in sync with the Speed sheet. Re-applied on every
  // change (and after a source swap) since a src swap during stream recovery
  // can reset it.
  useEffect(() => {
    player.playbackRate = speed;
  }, [speed, src, player]);

  // ----------------------------------------------------------- watchdog ----
  function clearStallTimer() {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }

  function markHealthy() {
    clearStallTimer();
    stallStage.current = 0;
    pendingSeek.current = null;
    setBuffering(false);
  }

  // Two-stage recovery if the player is still starved STALL_MS after a seek /
  // buffering event: first re-issue the seek at the same spot; if that also
  // fails, rebuild the stream there with a freshly signed URL.
  function armStallWatchdog() {
    clearStallTimer();
    stallTimer.current = setTimeout(() => {
      const healthy = player.status === "readyToPlay" && player.playing;
      if (healthy) {
        markHealthy();
        return;
      }
      if (stallStage.current === 0) {
        stallStage.current = 1;
        player.currentTime = pendingSeek.current ?? player.currentTime;
        armStallWatchdog();
        return;
      }
      void recoverStream();
    }, STALL_MS);
  }

  async function recoverStream() {
    if (recovering.current || recoveries.current >= MAX_RECOVERIES) return;
    recovering.current = true;
    recoveries.current += 1;
    const resume = player.playing || wasPlayingRef.current;
    const at = pendingSeek.current ?? player.currentTime ?? 0;
    try {
      let url = currentSrc.current ?? src;
      if (onRequestFreshSrc) {
        const fresh = await onRequestFreshSrc();
        if (fresh) url = fresh;
      }
      if (!url) return;
      setBuffering(true);
      currentSrc.current = url;
      await player.replaceAsync(url);
      player.currentTime = at;
      player.playbackRate = speed;
      if (resume) player.play();
      stallStage.current = 1; // a failed reload goes straight to giving up
      armStallWatchdog();
    } catch {
      // leave the spinner up; the watchdog / next event decides what's next
    } finally {
      recovering.current = false;
    }
  }

  useEffect(() => clearStallTimer, []);

  // ------------------------------------------------------------- events ----
  useEffect(() => {
    const subs = [
      player.addListener("sourceLoad", ({ duration: d }) => {
        durationRef.current = d;
        setDuration(d);
      }),
      player.addListener("playingChange", ({ isPlaying }) => {
        setPlaying(isPlaying);
        if (isPlaying) {
          markHealthy();
          recoveries.current = 0;
        } else {
          setShowControls(true);
          clearHideTimer();
        }
      }),
      player.addListener("statusChange", ({ status }) => {
        if (status === "loading") {
          setBuffering(true);
          armStallWatchdog();
        } else if (status === "readyToPlay") {
          if (player.duration) {
            durationRef.current = player.duration;
            setDuration(player.duration);
          }
          if (!draggingRef.current) markHealthy();
        } else if (status === "error") {
          setBuffering(true);
          void recoverStream();
        }
      }),
      player.addListener("timeUpdate", ({ currentTime }) => {
        lastTick.current = { t: currentTime, at: Date.now() };
        if (!draggingRef.current) setProgressUI(currentTime, durationRef.current);
        onTimeUpdate?.(currentTime);
      }),
      player.addListener("playToEnd", () => onEnded?.()),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, onTimeUpdate, onEnded]);

  // Mid-play rebuffering doesn't always surface as a status change: if the
  // player claims to be playing but the playhead stops moving, show the
  // spinner (and arm the watchdog) until it moves again.
  useEffect(() => {
    const id = setInterval(() => {
      if (!player.playing || draggingRef.current) return;
      const stuck = Date.now() - lastTick.current.at > 1500 && lastTick.current.at > 0;
      if (stuck) {
        setBuffering((b) => {
          if (!b) armStallWatchdog();
          return true;
        });
      } else {
        setBuffering((b) => (b && player.status === "readyToPlay" ? false : b));
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // ----------------------------------------------------------- controls ----
  function clearHideTimer() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }

  function scheduleHide() {
    clearHideTimer();
    if (!player.playing) return;
    hideTimer.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }

  useEffect(() => {
    if (showControls) scheduleHide();
    return clearHideTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls, playing]);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    []
  );

  function togglePlay() {
    if (player.playing) player.pause();
    else player.play();
  }

  function seekBy(seconds: number, side: "left" | "right") {
    const total = durationRef.current || Infinity;
    const target = Math.min(Math.max(0, player.currentTime + seconds), total);
    pendingSeek.current = target;
    player.currentTime = target;
    armStallWatchdog();
    setSeekFlash({ side, key: Date.now() });
    setProgressUI(target, durationRef.current);
  }

  // Single tap toggles the control layer (whether playing or paused); a
  // second tap on the same side within the window seeks instead.
  function handleOverlayTap(x: number, width: number) {
    const side: "left" | "right" = x < width / 2 ? "left" : "right";

    if (tapTimer.current && tapSide.current === side) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      tapSide.current = null;
      seekBy(side === "left" ? -SEEK_SECONDS : SEEK_SECONDS, side);
      return;
    }

    tapSide.current = side;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      tapSide.current = null;
      setShowControls((v) => !v);
    }, DOUBLE_TAP_MS);
  }

  // While the finger is down we only move the progress UI and the preview
  // frame. The real video is paused and seeked exactly once on release —
  // seeking on every move aborts each in-flight range request and leaves the
  // player stuck in a permanent loading state.
  const scrubTo = useCallback(
    (pageX: number) => {
      const total = durationRef.current;
      if (!total || !barWRef.current) return;
      const fraction = Math.min(1, Math.max(0, (pageX - barX.current) / barWRef.current));
      const time = fraction * total;
      scrubTimeRef.current = time;
      setProgressUI(time, total);
      setScrubTime(time);
    },
    [setProgressUI]
  );

  const beginDragRef = useRef<(pageX: number) => void>(() => {});
  const endDragRef = useRef<() => void>(() => {});
  beginDragRef.current = (pageX: number) => {
    wasPlayingRef.current = player.playing;
    if (player.playing) player.pause();
    draggingRef.current = true;
    setDragging(true);
    Animated.timing(grow, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    clearHideTimer();
    scrubTo(pageX);
  };
  endDragRef.current = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    Animated.timing(grow, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    setBuffering(true);
    pendingSeek.current = scrubTimeRef.current;
    player.currentTime = scrubTimeRef.current;
    if (wasPlayingRef.current) player.play();
    armStallWatchdog();
    scheduleHide();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const pageX = e.nativeEvent.pageX;
          // Absolute x of the bar's left edge, measured at touch-down so it's
          // right regardless of where the row sits.
          barRef.current?.measureInWindow((x) => {
            barX.current = x;
            beginDragRef.current(pageX);
          });
        },
        onPanResponderMove: (_, g) => {
          if (draggingRef.current) scrubTo(g.moveX);
        },
        onPanResponderRelease: () => endDragRef.current(),
        onPanResponderTerminate: () => endDragRef.current(),
      }),
    [scrubTo]
  );

  // -------------------------------------------------------- rail layout ----
  // The action rail lines up with the movie title: its Episodes icon sits
  // level with (or just above) the title text. The title's height above the
  // bottom edge depends on how many synopsis lines there are, so it's derived
  // from the measured title block and handed to the rail.
  const bottomPad = insets.bottom + 16;
  const railBottom = useMemo(() => {
    if (!title || !blockH) return 96; // no title: sit just above the seek bar
    // panel padding + progress row (24) + gap (8) + mb-11 (44) + the part of
    // the title block that sits above the title's own centre line.
    const titleCenterFromBottom = bottomPad + BAR_HEIGHT + 8 + 44 + (blockH - titleH / 2);
    // Episodes button: 36px icon + 2px gap + 12px label. Its icon centre is
    // ~32px above the rail's bottom edge; +8 puts it slightly above the
    // title's centre line.
    return Math.max(96, Math.round(titleCenterFromBottom - 32 + 8));
  }, [title, blockH, titleH, bottomPad]);

  // ------------------------------------------------------------ preview ----
  const layout = useMemo(() => (duration ? storyboardLayout(duration) : null), [duration]);
  const previewFrame = useMemo(() => {
    if (!layout) return null;
    const i = Math.min(layout.count - 1, Math.max(0, Math.round(scrubTime / layout.interval)));
    return { col: i % layout.cols, row: Math.floor(i / layout.cols) };
  }, [layout, scrubTime]);
  const scaleX = PREVIEW_W / SB_FRAME_W;
  const scaleY = PREVIEW_H / SB_FRAME_H;

  useEffect(() => {
    setSpriteReady(false);
  }, [storyboardUrl]);

  // ---------------------------------------------------------- flash anim ---
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!seekFlash) return;
    flash.setValue(0);
    Animated.timing(flash, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(
      ({ finished }) => finished && setSeekFlash(null)
    );
  }, [seekFlash, flash]);
  const flashOpacity = flash.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 1, 1, 0] });
  const flashScale = flash.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.75, 1, 1] });

  // -------------------------------------------------------------- render ---
  const barTrackH = grow.interpolate({ inputRange: [0, 1], outputRange: [4, 10] });
  const thumbSize = grow.interpolate({ inputRange: [0, 1], outputRange: [12, 20] });

  const fillX = progress.interpolate({ inputRange: [0, 1], outputRange: [-barW, 0] });
  const thumbX = Animated.subtract(Animated.multiply(progress, barW), Animated.multiply(thumbSize, 0.5));

  const bar = (
    <View
      ref={barRef}
      onLayout={(e: LayoutChangeEvent) => {
        barWRef.current = e.nativeEvent.layout.width;
        setBarW(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
      className="flex-1 justify-center"
      style={{ height: BAR_HEIGHT }}
    >
      <Animated.View
        className="w-full overflow-hidden rounded-full"
        style={{
          height: barTrackH,
          backgroundColor: dragging ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)",
        }}
      >
        <Animated.View
          className="h-full w-full rounded-full bg-pink"
          style={{ transform: [{ translateX: fillX }], opacity: dragging ? 1 : 0.95 }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-full bg-white"
        style={{
          left: 0,
          width: thumbSize,
          height: thumbSize,
          top: Animated.subtract(BAR_HEIGHT / 2, Animated.multiply(thumbSize, 0.5)),
          transform: [{ translateX: thumbX }],
          borderWidth: dragging ? 4 : 0,
          borderColor: "rgba(255,42,105,0.6)",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      />
    </View>
  );

  const railNode = typeof actionRail === "function" ? actionRail(railBottom) : actionRail;

  return (
    <View className="relative h-full w-full bg-black">
      {posterUrl && buffering && !playing ? (
        <Image source={{ uri: posterUrl }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} contentFit="contain" />
      ) : null}

      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={false}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />

      {/* Tap zones: single tap toggles the control layer, a second tap on the
          same side within the window seeks instead. */}
      <Pressable
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        onPress={(e) => handleOverlayTap(e.nativeEvent.locationX, (e.currentTarget as unknown as { width?: number }).width ?? 0)}
        onLayout={undefined}
      />

      {buffering ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" />
        </View>
      ) : null}

      {seekFlash ? (
        <Animated.View
          pointerEvents="none"
          className="absolute top-0 h-full w-1/2 items-center justify-center gap-1"
          style={[seekFlash.side === "left" ? { left: 0 } : { right: 0 }, { opacity: flashOpacity, transform: [{ scale: flashScale }] }]}
        >
          {seekFlash.side === "left" ? <RotateCcw size={26} color="#fff" /> : <RotateCw size={26} color="#fff" />}
          <Text className="text-[13px] font-semibold text-white">{SEEK_SECONDS}s</Text>
        </Animated.View>
      ) : null}

      {/* Center play/pause — only when paused, or briefly after a tap reveals
          the control layer. */}
      <FadeLayer visible={showControls} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Pressable
          onPress={() => {
            setIconPulse((n) => n + 1);
            togglePlay();
          }}
          className="h-16 w-16 items-center justify-center rounded-full bg-black/45"
          style={({ pressed }) => (pressed ? { transform: [{ scale: 0.95 }] } : null)}
        >
          <Pop active trigger={iconPulse}>
            {playing ? <Pause size={26} color="#fff" fill="#fff" /> : <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />}
          </Pop>
        </Pressable>
      </FadeLayer>

      {/* Top bar (back + EP badge + speed/more) — same show/hide behaviour as
          every other overlay. */}
      {topBar ? (
        <FadeLayer visible={showControls} style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
          {topBar}
        </FadeLayer>
      ) : null}

      {/* App-icon watermark, bottom-left. Deliberately NOT tied to showControls
          — it stays visible whether or not the control layer is faded. It sits
          in the gap between the seek bar and the title/synopsis block so it
          never collides with either. */}
      <Image
        source={require("@/assets/watermark.png")}
        pointerEvents="none"
        style={{ position: "absolute", left: 14, bottom: insets.bottom + 52, width: 32, height: 32, borderRadius: 6, opacity: 0.55, zIndex: 10 }}
        contentFit="cover"
      />

      {/* Action rail (save/comments/share/episodes) — fades with the rest of
          the controls layer instead of staying pinned on screen. */}
      {railNode ? (
        <FadeLayer visible={showControls} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          {railNode}
        </FadeLayer>
      ) : null}

      {/* Scrub preview: floating 9:16 frame + timestamp, shown only while
          actively dragging, sitting just above the title. */}
      {dragging ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 z-30 items-center gap-2"
          style={{ bottom: panelH - 20 }}
        >
          <View
            className="overflow-hidden rounded-md border border-white/25 bg-black"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
          >
            {storyboardUrl && layout && previewFrame ? (
              <Image
                source={{ uri: storyboardUrl }}
                onLoad={() => setSpriteReady(true)}
                contentFit="fill"
                style={{
                  position: "absolute",
                  width: layout.cols * SB_FRAME_W * scaleX,
                  height: layout.rows * SB_FRAME_H * scaleY,
                  left: -previewFrame.col * SB_FRAME_W * scaleX,
                  top: -previewFrame.row * SB_FRAME_H * scaleY,
                  opacity: spriteReady ? 1 : 0,
                }}
              />
            ) : null}
          </View>
          <View className="rounded-full bg-black/70 px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-white">
              {formatTime(scrubTime)} / {formatTime(duration)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom panel: title/synopsis, then progress bar + time */}
      <FadeLayer
        visible={showControls}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
      >
        <View
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
          className="gap-2 px-4 pt-10"
          style={{ paddingBottom: bottomPad }}
        >
          <Scrim from={0.8} via={0.1} />

          {title || synopsis ? (
            <Pressable
              onPress={() => onOpenDetails?.()}
              onLayout={(e) => setBlockH(e.nativeEvent.layout.height)}
              className="mb-11 self-start"
              style={{ maxWidth: "72%" }}
            >
              {title ? (
                <Text
                  onLayout={(e) => setTitleH(e.nativeEvent.layout.height)}
                  className="text-[16px] font-semibold text-white"
                  style={shadow}
                >
                  {title}
                </Text>
              ) : null}
              {synopsis ? (
                <Text numberOfLines={3} className="mt-0.5 text-[12px] leading-snug text-white/80" style={shadow}>
                  {synopsis}
                </Text>
              ) : null}
            </Pressable>
          ) : null}

          <View className="flex-row items-center gap-2.5">
            <Text
              className="text-[11px] font-medium"
              style={{
                minWidth: 34,
                color: dragging ? "#fff" : "rgba(255,255,255,0.9)",
                transform: [{ scale: dragging ? 1.1 : 1 }],
              }}
            >
              {formatTime(clock)}
            </Text>
            {bar}
            <Text
              className="text-right text-[11px] font-medium"
              style={{
                minWidth: 34,
                color: dragging ? "#fff" : "rgba(255,255,255,0.9)",
                transform: [{ scale: dragging ? 1.1 : 1 }],
              }}
            >
              {formatTime(duration)}
            </Text>
          </View>
        </View>
      </FadeLayer>
    </View>
  );
}

import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Zap } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { BottomSheet } from "@/components/shared/BottomSheet";

const supabase = createClient();
const R = 26;
const CIRC = 2 * Math.PI * R;

export function AdWatchSheet({ open, taskKey, onClose, onCredited }: {
  open: boolean; taskKey: string | null;
  onClose: () => void; onCredited: (coins: number) => void;
}) {
  const [phase, setPhase] = useState<"loading"|"playing"|"done"|"error">("loading");
  const [ad, setAd] = useState<{ title: string } | null>(null);
  const [duration, setDuration] = useState(15);
  const [remaining, setRemaining] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState(0);
  const viewId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    if (!open || !taskKey) return;
    setPhase("loading"); setError(null); setCredited(0);
    supabase.rpc("start_ad_view", { p_task_key: taskKey }).then(({ data, error: e }) => {
      if (e || !data?.ok) { setError(data?.error === "daily_cap_reached" ? "You've hit today's limit." : "Ads aren't available right now."); setPhase("error"); return; }
      viewId.current = data.view_id; setAd(data.ad); setDuration(data.duration_seconds); setRemaining(data.duration_seconds); setPhase("playing");
    });
  }, [open, taskKey]);

  useEffect(() => {
    if (phase !== "playing") return;
    timer.current = setInterval(() => setRemaining((r) => { if (r <= 1) { clearInterval(timer.current!); return 0; } return r - 1; }), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && remaining === 0 && viewId.current) {
      supabase.rpc("complete_ad_view", { p_view_id: viewId.current }).then(({ data, error: e }) => {
        if (e || !data?.ok) { setError("Couldn't confirm the view. Try again."); setPhase("error"); return; }
        setCredited(data.credited); setPhase("done"); onCredited(data.credited);
      });
    }
  }, [remaining, phase, onCredited]);

  const progress = phase === "playing" ? (duration - remaining) / duration : phase === "done" ? 1 : 0;
  const dash = CIRC * (1 - progress);

  return (
    <BottomSheet open={open} onClose={onClose} title={ad?.title ?? "Watch to earn"}>
      <View className="items-center gap-4 px-5 py-6">
        {phase === "error" ? (
          <><Text className="text-[14px] text-crimson">{error}</Text><Button variant="secondary" size="sm" onPress={onClose}>Close</Button></>
        ) : phase === "done" ? (
          <>
            <Pop active style={{ alignSelf:"center" }}>
              <View className="h-16 w-16 items-center justify-center rounded-full bg-gold-soft">
                <Icon as={Zap} size={28} tone="gold" fillTone="gold" />
              </View>
            </Pop>
            <Text className="font-display text-lg font-semibold text-text">+{credited} reward coins</Text>
            <Button size="sm" onPress={onClose}>Nice</Button>
          </>
        ) : (
          <>
            <View className="relative h-16 w-16 items-center justify-center">
              <Svg width={64} height={64} style={{ transform: [{ rotate: "-90deg" }] }}>
                <Circle cx={32} cy={32} r={R} fill="none" strokeWidth={5} stroke="rgb(41,44,52)" />
                <Circle cx={32} cy={32} r={R} fill="none" strokeWidth={5} strokeLinecap="round" stroke="rgb(255,42,105)"
                  strokeDasharray={`${CIRC}`} strokeDashoffset={dash} />
              </Svg>
              <Text className="absolute font-display text-[15px] font-semibold text-text">{phase === "loading" ? "" : remaining}</Text>
            </View>
            <Text className="text-[13px] text-muted">{phase === "loading" ? "Loading…" : "Stay on this screen to earn your reward."}</Text>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

import { View } from "react-native";
import { Bell, BellRing, CalendarClock, Check, Clock, Gift, Mail, MessageCircle, Play, Share2, Zap } from "lucide-react-native";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import type { RewardTask } from "@/lib/rewards";
import { taskCtaLabel, taskProgressLabel } from "@/lib/rewards";
import { useI18n } from "@/hooks/useI18n";

const ICONS: Record<string, LucideIcon> = {
  login_reward: Gift, link_email: Mail, link_whatsapp: MessageCircle,
  enable_notifications: BellRing, reserve_drama: CalendarClock,
  follow_youtube: Play, follow_tiktok: MessageCircle,
  follow_facebook: Share2, follow_instagram: Share2,
  watch_10: Clock, watch_15: Clock, watch_20: Clock,
  watch_ad: Play, checkin_bonus_ad: Play,
};

export function TaskRow({ task, busy, onAction }: { task: RewardTask; busy: boolean; onAction: (t: RewardTask) => void }) {
  const { t, tr } = useI18n();
  const IconComp = ICONS[task.key] ?? Bell;
  const done = task.status === "done";
  const label = taskCtaLabel(task);
  const progress = taskProgressLabel(task);

  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
      <View className={clsx("h-10 w-10 shrink-0 items-center justify-center rounded-full", done ? "bg-surface-raised" : "bg-pink/10")}>
        <Icon as={IconComp} size={18} tone={done ? "muted" : "pink"} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[14px] font-medium text-text">
          {tr(`rewardTask.${task.key}`, task.title)}{progress ? <Text className="text-muted"> {progress}</Text> : null}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1">
          <Icon as={Zap} size={12} tone="gold" fillTone="gold" />
          <Text className="text-[12.5px] text-gold">+{task.reward_coins}</Text>
          {task.kind === "watch_time" && task.progress_seconds != null && task.threshold_seconds && !done ? (
            <Text className="ml-1 text-[12.5px] text-muted">
              ({Math.min(task.progress_seconds, task.threshold_seconds)}s/{task.threshold_seconds}s)
            </Text>
          ) : null}
        </View>
      </View>
      <Button size="sm" variant={done ? "secondary" : "primary"} disabled={done || busy} onPress={() => onAction(task)}>
        {done ? <Icon as={Check} size={14} tone="muted" /> : null}
        {t(label)}
      </Button>
    </View>
  );
}

// components/shared/ThemeToggle.tsx

import { Pressable, View } from "react-native";
import { Moon, Sun, MonitorSmartphone } from "lucide-react-native";
import clsx from "clsx";
import { useTheme } from "@/hooks/useTheme";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

const options = [
  { value: "light" as const, icon: Sun, labelKey: "settings.themeLight" },
  { value: "dark" as const, icon: Moon, labelKey: "settings.themeDark" },
  { value: "system" as const, icon: MonitorSmartphone, labelKey: "settings.themeSystem" },
];

export function ThemeToggle() {
  const { t } = useI18n();
  const { mode, setTheme } = useTheme();

  return (
    <View className="flex-row items-center self-start rounded-md border border-border bg-surface p-1">
      {options.map(({ value, icon, labelKey }) => (
        <Pressable
          key={value}
          onPress={() => setTheme(value)}
          accessibilityLabel={t(labelKey)}
          className={clsx("h-8 w-8 items-center justify-center rounded-sm", mode === value && "bg-pink")}
        >
          <Icon as={icon} size={15} strokeWidth={2} tone={mode === value ? "white" : "muted"} />
        </Pressable>
      ))}
    </View>
  );
}

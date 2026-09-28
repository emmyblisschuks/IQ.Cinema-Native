// components/shared/ThemeToggle.tsx

import { Pressable, View } from "react-native";
import { Moon, Sun, MonitorSmartphone } from "lucide-react-native";
import clsx from "clsx";
import { useTheme } from "@/hooks/useTheme";
import { Icon } from "@/components/ui/Icon";

const options = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: MonitorSmartphone, label: "System" },
];

export function ThemeToggle() {
  const { mode, setTheme } = useTheme();

  return (
    <View className="flex-row items-center self-start rounded-md border border-border bg-surface p-1">
      {options.map(({ value, icon, label }) => (
        <Pressable
          key={value}
          onPress={() => setTheme(value)}
          accessibilityLabel={label}
          className={clsx("h-8 w-8 items-center justify-center rounded-sm", mode === value && "bg-pink")}
        >
          <Icon as={icon} size={15} strokeWidth={2} tone={mode === value ? "white" : "muted"} />
        </Pressable>
      ))}
    </View>
  );
}

import { View } from "react-native";
import { Check } from "lucide-react-native";
import clsx from "clsx";
import { Icon } from "@/components/ui/Icon";

// Round checkbox shown on cards while the list is in edit mode. `overlay`
// sits on top of a poster (white ring on dark scrim); `plain` is the muted
// outline used on the page background.
export function SelectDot({
  selected,
  variant = "overlay",
  className,
}: {
  selected: boolean;
  variant?: "overlay" | "plain";
  className?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={clsx(
        "h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
        selected
          ? "border-pink bg-pink"
          : variant === "overlay"
            ? "border-white/80 bg-black/30"
            : "border-muted/60 bg-transparent",
        className
      )}
    >
      <Icon as={Check} size={14} strokeWidth={3.5} tone={selected ? "white" : "transparent"} />
    </View>
  );
}

import { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import type { ColorName } from "@/lib/theme";

// Web icons pick up `currentColor` from the surrounding text-* class; native
// has no such inheritance, so icons take a theme tone instead. Containers
// (Button) can provide a default tone through context.
export type Tone = ColorName | "white" | "black" | "inherit";

export const IconToneContext = createContext<Tone>("text");

export function useTone(tone?: Tone | string) {
  const { colors } = useTheme();
  const inherited = useContext(IconToneContext);
  const t = tone ?? inherited;
  if (t === "white") return "#ffffff";
  if (t === "black") return "#000000";
  if (t in colors) return colors[t as ColorName];
  return t as string; // an explicit CSS/hex color
}

export function Icon({
  as: Glyph,
  size = 16,
  tone,
  fillTone,
  strokeWidth,
}: {
  as: LucideIcon;
  size?: number;
  tone?: Tone | string;
  fillTone?: Tone | string;
  strokeWidth?: number;
}) {
  const color = useTone(tone);
  const fillColor = useTone(fillTone ?? "transparent");
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={fillTone ? fillColor : "none"}
    />
  );
}

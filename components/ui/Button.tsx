// components/ui/Button.tsx

import { Children, forwardRef, isValidElement, type ReactNode } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { IconToneContext, type Tone } from "@/components/ui/Icon";

type Variant = "primary" | "secondary" | "ghost" | "gold" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

// Same brand treatments as the web Button: pink → crimson gradient primary,
// solid gold, solid crimson for consequential actions.
const variants: Record<Variant, { box: string; text: string; tone: Tone | string }> = {
  primary: { box: "", text: "text-white", tone: "white" },
  secondary: { box: "border border-border bg-surface-raised", text: "text-text", tone: "text" },
  ghost: { box: "bg-transparent", text: "text-text", tone: "text" },
  gold: { box: "bg-gold", text: "text-[rgb(20,16,8)]", tone: "rgb(20,16,8)" },
  danger: { box: "bg-crimson", text: "text-white", tone: "white" },
};

const sizes: Record<Size, { box: string; text: string }> = {
  sm: { box: "h-9 px-3.5 gap-1.5", text: "text-sm" },
  md: { box: "h-11 px-5 gap-2", text: "text-[15px]" },
  lg: { box: "h-14 px-6 gap-2", text: "text-base" },
  icon: { box: "h-11 w-11 p-0", text: "text-[15px]" },
};

const glow = {
  primary: { shadowColor: "rgb(255,42,105)", shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  gold: { shadowColor: "rgb(180,128,58)", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  danger: { shadowColor: "rgb(150,45,40)", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
} as const;

export interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: Variant;
  size?: Size;
  className?: string;
  textClassName?: string;
  children?: ReactNode;
}

export const Button = forwardRef<View, ButtonProps>(
  ({ className, textClassName, variant = "primary", size = "md", disabled, style, children, ...props }, ref) => {
    const v = variants[variant];
    const s = sizes[size];

    // A caller-supplied text color (e.g. `text-crimson`) replaces the
    // variant's own, rather than fighting it in the generated stylesheet.
    const overridesColor = !!textClassName && /(^|\s)text-(?!\[?\d|xs\b|sm\b|base\b|lg\b|xl\b|left|center|right)/.test(textClassName);

    const content = Children.map(children, (child) =>
      typeof child === "string" || typeof child === "number" ? (
        <Text className={clsx("font-semibold tracking-tight", s.text, !overridesColor && v.text, textClassName)}>{child}</Text>
      ) : isValidElement(child) || child == null ? (
        child
      ) : (
        child
      )
    );

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        className={clsx(
          "shrink-0 flex-row items-center justify-center rounded-md",
          v.box,
          s.box,
          disabled && "opacity-50",
          className
        )}
        style={(state) => [
          !disabled && variant in glow ? glow[variant as keyof typeof glow] : null,
          state.pressed && !disabled ? { transform: [{ scale: 0.98 }], opacity: 0.92 } : null,
          typeof style === "function" ? style(state) : style,
        ]}
        {...props}
      >
        {variant === "primary" && (
          <LinearGradient
            colors={["rgb(255,42,105)", "rgb(150,45,40)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10 }}
          />
        )}
        <IconToneContext.Provider value={v.tone as Tone}>{content}</IconToneContext.Provider>
      </Pressable>
    );
  }
);
Button.displayName = "Button";

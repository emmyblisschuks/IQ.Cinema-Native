import { createContext, forwardRef, useContext } from "react";
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from "react-native";
import { FONT } from "@/lib/theme";

// React Native picks a font weight by loading a separate face per weight, so
// the web's `font-semibold` etc. have to resolve to a family name. This reads
// the weight/`font-display`/`italic` classes and swaps the family, then drops
// the weight class so the platform doesn't also try to synthesize bold on top.
const WEIGHT_RE = /(^|\s)font-(normal|light|medium|semibold|bold|extrabold|black)(?=\s|$)/;
const WEIGHT_RE_G = new RegExp(WEIGHT_RE.source, "g");

export function resolveFont(className?: string) {
  const c = className ?? "";
  const display = /(^|\s)font-display(?=\s|$)/.test(c);
  const italic = /(^|\s)italic(?=\s|$)/.test(c);
  const weightMatch = c.match(WEIGHT_RE)?.[2];
  const weight = weightMatch ?? "normal";
  const explicit = display || italic || !!weightMatch;

  let family: string;
  if (display) {
    if (italic) family = FONT["display-italic"];
    else if (weight === "bold" || weight === "extrabold" || weight === "black") family = FONT["display-bold"];
    else if (weight === "medium") family = FONT["display-medium"];
    else family = FONT.display;
  } else if (weight === "medium") family = FONT["sans-medium"];
  else if (weight === "semibold") family = FONT["sans-semibold"];
  else if (weight === "bold") family = FONT["sans-bold"];
  else if (weight === "extrabold" || weight === "black") family = FONT["sans-extrabold"];
  else family = FONT.sans;

  const cleaned = c.replace(WEIGHT_RE_G, " ").replace(/(^|\s)font-display(?=\s|$)/g, " ").replace(/(^|\s)italic(?=\s|$)/g, " ");
  return { family, explicit, className: cleaned.trim() };
}

// Nested <Text> (the web's inline <span>) must inherit color and font from its
// parent instead of resetting them to the defaults.
const NestedText = createContext(false);

export const Text = forwardRef<RNText, TextProps & { className?: string }>(
  ({ className, style, ...props }, ref) => {
    const nested = useContext(NestedText);
    const f = resolveFont(className);
    return (
      <NestedText.Provider value>
        <RNText
          ref={ref}
          // Default text color matches the web body color.
          className={nested ? f.className : `text-text ${f.className}`}
          style={[!nested || f.explicit ? { fontFamily: f.family } : null, style]}
          {...props}
        />
      </NestedText.Provider>
    );
  }
);
Text.displayName = "Text";

export const TextInput = forwardRef<RNTextInput, TextInputProps & { className?: string }>(
  ({ className, style, placeholderTextColor, ...props }, ref) => {
    const f = resolveFont(className);
    return (
      <RNTextInput
        ref={ref}
        className={`text-text ${f.className}`}
        style={[{ fontFamily: f.family }, style]}
        placeholderTextColor={placeholderTextColor ?? "rgb(152, 154, 163)"}
        {...props}
      />
    );
  }
);
TextInput.displayName = "TextInput";

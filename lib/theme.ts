// lib/theme.ts
//
// Design tokens, ported 1:1 from styles/globals.css of the web app.
// Values are space-separated RGB triplets so Tailwind's
// `rgb(var(--x) / <alpha-value>)` colors keep working under NativeWind.

export const lightTokens = {
  "--bg": "250 249 247",
  "--surface": "255 255 255",
  "--surface-raised": "247 245 242",
  "--border": "231 229 225",
  "--text": "20 21 26",
  "--muted": "107 110 118",
  "--gold": "180 128 58",
  "--gold-soft": "245 232 213",
  "--crimson": "150 45 40",
  "--crimson-soft": "250 228 226",
  "--pink": "255 42 105",
  "--pink-soft": "255 42 105",
} as const;

export const darkTokens = {
  "--bg": "11 12 16",
  "--surface": "20 22 27",
  "--surface-raised": "27 29 35",
  "--border": "41 44 52",
  "--text": "240 238 233",
  "--muted": "152 154 163",
  "--gold": "196 146 74",
  "--gold-soft": "43 36 24",
  "--crimson": "196 82 74",
  "--crimson-soft": "43 24 24",
  "--pink": "255 42 105",
  "--pink-soft": "255 42 105",
} as const;

export type ColorName =
  | "bg"
  | "surface"
  | "surface-raised"
  | "border"
  | "text"
  | "muted"
  | "gold"
  | "gold-soft"
  | "crimson"
  | "crimson-soft"
  | "pink"
  | "pink-soft";

export type Palette = Record<ColorName, string>;

function toPalette(t: Record<string, string>): Palette {
  const out = {} as Palette;
  for (const key of Object.keys(t)) {
    out[key.slice(2) as ColorName] = `rgb(${t[key].split(" ").join(", ")})`;
  }
  return out;
}

export const lightPalette = toPalette(lightTokens);
export const darkPalette = toPalette(darkTokens);

// Status-bar / system chrome tint (same hex values as the web theme-color meta).
export const chromeColor = { light: "#faf9f7", dark: "#0b0c10" } as const;

// Font families: React Native selects weights by family name, so each weight
// used by the web CSS maps to its own loaded face.
export const FONT = {
  sans: "Manrope_400Regular",
  "sans-medium": "Manrope_500Medium",
  "sans-semibold": "Manrope_600SemiBold",
  "sans-bold": "Manrope_700Bold",
  "sans-extrabold": "Manrope_800ExtraBold",
  display: "Fraunces_600SemiBold",
  "display-medium": "Fraunces_500Medium",
  "display-bold": "Fraunces_700Bold",
  "display-italic": "Fraunces_600SemiBold_Italic",
} as const;

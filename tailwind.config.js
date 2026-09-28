/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--surface-raised) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        "gold-soft": "rgb(var(--gold-soft) / <alpha-value>)",
        crimson: "rgb(var(--crimson) / <alpha-value>)",
        "crimson-soft": "rgb(var(--crimson-soft) / <alpha-value>)",
        pink: "rgb(var(--pink) / <alpha-value>)",
        "pink-soft": "rgb(var(--pink-soft) / <alpha-value>)",
      },
      borderRadius: { sm: "6px", md: "10px", lg: "16px", xl: "22px" },
    },
  },
  plugins: [],
};

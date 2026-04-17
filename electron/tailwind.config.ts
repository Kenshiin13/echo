import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        "echo-bg": "#0B1220",
        "echo-surface": "#111827",
        "echo-surface-2": "#1a2436",
        "echo-border": "#1e2d45",
        "echo-accent": "#3FA8E0",
        "echo-accent-hover": "#5BB8EE",
        "echo-text": "#E8EDF5",
        "echo-muted": "#6B7A99",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg-primary)",
        sidebar: "var(--bg-sidebar)",
        surface: "var(--bg-surface)",
        card: "var(--bg-card)",
        border: "var(--border)",
        "border-glow": "var(--border-glow)",
        accent: "var(--accent)",
        "accent-bright": "var(--accent-bright)",
        "accent-dim": "var(--accent-dim)",
        survive: "var(--survive)",
        rug: "var(--rug)",
        warn: "var(--warning)",
        foreground: "var(--text-primary)",
        muted: "var(--text-muted)",
        "fg-soft": "var(--text-secondary)",
        ink: "var(--on-accent)",
        glow: "var(--glow)",
      },
      fontFamily: {
        sans: ["var(--font-display)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        glow: "0 0 28px var(--glow), 0 0 1px var(--border-glow)",
        "glow-sm": "0 0 16px var(--glow)",
        "inset-glow": "inset 0 0 20px var(--inset-glow)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "enter-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "flash-up": {
          "0%": { backgroundColor: "transparent" },
          "35%": { backgroundColor: "rgba(45, 212, 191, 0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-down": {
          "0%": { backgroundColor: "transparent" },
          "35%": { backgroundColor: "rgba(251, 113, 133, 0.26)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-accent": {
          "0%": { color: "var(--text-primary)" },
          "40%": { color: "var(--accent-bright)" },
          "100%": { color: "var(--text-primary)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease forwards",
        "enter-up": "enter-up 0.3s ease forwards",
        "flash-up": "flash-up 0.45s ease-out",
        "flash-down": "flash-down 0.45s ease-out",
        "flash-accent": "flash-accent 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

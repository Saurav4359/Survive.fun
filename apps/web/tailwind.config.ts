import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* shadcn semantic */
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",

        /* Survive.fun strict palette */
        bg: "#000000",
        surface: "#0a0a0a",
        "border-accent": "rgba(138, 255, 142, 0.125)",
        "accent-bright": "var(--accent-bright)",
        "accent-dim": "var(--accent-dim)",
        survive: "#8aff8e",
        rug: "#ef4444",
        warn: "#facc15",
        "fg-soft": "#a3a3a3",
        "fg-muted": "#525252",
        ink: "#000000",
        glow: "rgba(138, 255, 142, 0.22)",
      },
      fontFamily: {
        sans: ["var(--font-display)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        glow: "0 0 28px var(--glow), 0 0 1px var(--accent)",
        "glow-sm": "0 0 16px var(--glow)",
        "glow-lg": "0 0 48px var(--glow)",
      },
    },
  },
  plugins: [],
};

export default config;

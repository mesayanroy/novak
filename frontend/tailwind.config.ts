import type { Config } from "tailwindcss";

// Strict black/white/gray design system — see docs/FRONTEND_SPEC.md for the
// full rationale. No accent hue anywhere; every color below is either pure
// black/white or a step on one neutral (very slightly warm) gray ramp.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0908",
        paper: "#FDFDFC",
        gray: {
          50: "#F7F6F5",
          100: "#EEEDEB",
          200: "#E2E0DD",
          300: "#C9C6C1",
          400: "#A19D97",
          500: "#78746E",
          600: "#57534E",
          700: "#3D3A36",
          800: "#262421",
          900: "#171512",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.55" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.6" }],
        xl: ["1.375rem", { lineHeight: "1.5" }],
        "2xl": ["1.75rem", { lineHeight: "1.35" }],
        "3xl": ["2.25rem", { lineHeight: "1.25" }],
        "4xl": ["3rem", { lineHeight: "1.15" }],
        "5xl": ["4rem", { lineHeight: "1.05" }],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

export default config;

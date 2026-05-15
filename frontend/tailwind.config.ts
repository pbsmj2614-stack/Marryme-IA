import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── Escala brand (roxo → lilás) ─────────────────────────────── */
        brand: {
          50: "#f5efff" /* lavanda quase branco — bg ativo leve       */,
          100: "#ede0ff" /* lavanda clara — badges, tags                */,
          200: "#dcc4ff",
          300: "#c9a0fd",
          400: "#C084FC" /* lilás vibrante — secondary highlights       */,
          500: "#a84ff8",
          600: "#8b2fe8" /* roxo vibrante — CTAs em fundo claro         */,
          700: "#2D1654" /* roxo médio — primary-mid, textos escuros    */,
          800: "#1A0A2E" /* roxo noite — nav, fundos premium            */,
          900: "#0f0620",
        },
        /* ── Cores nomeadas da paleta MM ─────────────────────────────── */
        mm: {
          fuchsia: "#E879F9" /* rosa-lilás — accent, hover, CTA principal */,
          warm: "#F472B6" /* rosa quente — badges emocionais           */,
          gold: "#D4AF37" /* dourado — premium, conversão especial     */,
          lilac: "#C084FC" /* lilás vibrante (alias brand-400)          */,
          purple: "#2D1654" /* roxo médio (alias brand-700)              */,
          night: "#1A0A2E" /* roxo noite (alias brand-800)              */,
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        lora: ["var(--font-lora)", "Georgia", "serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

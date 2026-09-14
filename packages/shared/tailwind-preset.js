/**
 * Hana design system — the single source of truth for every surface in this monorepo.
 *
 * All four apps (checkout, store, merchant, docs) consume this as a Tailwind preset so a
 * token changed here changes everywhere. Components must never hardcode a hex value or an
 * off-scale pixel number; if a color isn't here, add it here.
 *
 * The product is dark-committed by design (a credit terminal, not a document), so there is
 * one palette rather than a light/dark pair — `color-scheme: dark` is declared in addBase.
 */
const defaultTheme = require("tailwindcss/defaultTheme");
const plugin = require("tailwindcss/plugin");

/* Cool-gray ground, violet→cyan accent. Every text pair below passes WCAG AA on its
 * intended surface — `fg-subtle` (4.8:1 on base) is the floor, nothing dimmer ships. */
const palette = {
  base: "#07080C",
  surface: { DEFAULT: "#0D0F16", 2: "#141824", 3: "#1B2030" },
  line: { DEFAULT: "#1E2331", strong: "#2A3142" },
  fg: { DEFAULT: "#E8EAF0", muted: "#9AA3B8", subtle: "#7C8699" },
  accent: { DEFAULT: "#7C5CFF", hi: "#9B85FF", lo: "#5B3FE8" },
  aqua: { DEFAULT: "#22D3EE", lo: "#0E9AAF" },
  pos: { DEFAULT: "#34D399", dim: "#124C3A" },
  warn: { DEFAULT: "#FBBF24", dim: "#4A3510" },
  neg: { DEFAULT: "#FB7185", dim: "#4C1D28" },
};

/* A faint film of noise over the ambient mesh. Large low-opacity radial gradients band badly
 * on 8-bit displays; ~3% monochrome noise breaks the banding up without reading as texture. */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E\")";

module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: palette,

      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },

      /* Display sizes carry negative tracking; body stays at 0. Tight tracking on large type is
       * most of what separates "designed" from "default Tailwind". */
      letterSpacing: {
        display: "-0.028em",
        tight2: "-0.018em",
      },

      borderRadius: {
        card: "0.875rem", // 14px — every card, panel, and table container
        ctl: "0.5rem", // 8px — every button, input, select
      },

      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.45)",
        pop: "0 16px 48px -12px rgb(0 0 0 / 0.75)",
        "glow-accent": "0 0 0 1px rgb(124 92 255 / 0.35), 0 8px 32px -8px rgb(124 92 255 / 0.45)",
        "glow-pos": "0 0 0 1px rgb(52 211 153 / 0.35), 0 8px 32px -8px rgb(52 211 153 / 0.35)",
      },

      backgroundImage: {
        "grad-accent": "linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)",
        "grad-accent-r": "linear-gradient(90deg, #7C5CFF 0%, #22D3EE 100%)",
        "grad-accent-soft":
          "linear-gradient(135deg, rgb(124 92 255 / 0.16) 0%, rgb(34 211 238 / 0.10) 100%)",
        "grad-hairline":
          "linear-gradient(90deg, transparent, rgb(124 92 255 / 0.55), rgb(34 211 238 / 0.45), transparent)",
        "grad-pos": "linear-gradient(135deg, #34D399 0%, #22D3EE 100%)",
        /* Ambient hero wash — two wide radials, deliberately off-center so it reads as light
         * in a room rather than a centered spotlight. */
        "grad-mesh":
          "radial-gradient(80rem 40rem at 15% -10%, rgb(124 92 255 / 0.16), transparent 60%), radial-gradient(60rem 32rem at 95% 0%, rgb(34 211 238 / 0.10), transparent 60%)",
        noise: NOISE,
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.055) 50%, transparent 100%)",
      },

      keyframes: {
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        /* The attestation wait is ~9 real minutes. A spinner would read as "hung"; a slow,
         * unhurried breath reads as "working". */
        breathe: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "ring-out": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },

      animation: {
        "fade-rise": "fade-rise 220ms cubic-bezier(0,0,0.2,1) both",
        "fade-in": "fade-in 180ms cubic-bezier(0,0,0.2,1) both",
        shimmer: "shimmer 1.6s cubic-bezier(0.4,0,0.2,1) infinite",
        breathe: "breathe 2.4s cubic-bezier(0.4,0,0.2,1) infinite",
        "ring-out": "ring-out 2s cubic-bezier(0,0,0.2,1) infinite",
        "gradient-pan": "gradient-pan 6s cubic-bezier(0.4,0,0.2,1) infinite",
      },
    },
  },

  plugins: [
    plugin(function hanaBase({ addBase, addComponents, theme }) {
      addBase({
        ":root": { colorScheme: "dark" },

        /* Accessibility setting, not a preference — motion is removed, not merely shortened.
         * Components still use motion-safe: variants; this is the backstop for anything
         * (including third-party CSS like RainbowKit's) that forgets. */
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },

        body: {
          backgroundColor: palette.base,
          color: palette.fg.DEFAULT,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          fontFeatureSettings: '"cv11", "ss01"',
        },

        "::selection": { backgroundColor: "rgb(124 92 255 / 0.32)" },

        /* Headings default to display tracking so no page has to remember. */
        "h1, h2, h3": { letterSpacing: theme("letterSpacing.display") },

        /* One focus ring, brand-colored, everywhere — never the browser default. */
        "*:focus-visible": {
          outline: "2px solid rgb(124 92 255 / 0.9)",
          outlineOffset: "2px",
          borderRadius: "4px",
        },

        /* Numbers must never jitter as they update. */
        "input[type='number'], .tnum": { fontVariantNumeric: "tabular-nums" },

        "::-webkit-scrollbar": { width: "10px", height: "10px" },
        "::-webkit-scrollbar-track": { background: "transparent" },
        "::-webkit-scrollbar-thumb": {
          background: palette.line.strong,
          borderRadius: "9999px",
          border: `2px solid ${palette.base}`,
        },
        "::-webkit-scrollbar-thumb:hover": { background: "#3A4358" },
      });

      addComponents({
        /* ---------------------------------------------------------------- surfaces */
        ".surface-mesh": {
          position: "relative",
          backgroundImage: theme("backgroundImage.grad-mesh"),
        },
        ".surface-mesh::before": {
          content: '""',
          position: "absolute",
          inset: "0",
          backgroundImage: NOISE,
          pointerEvents: "none",
        },

        ".card": {
          backgroundColor: palette.surface.DEFAULT,
          border: `1px solid ${palette.line.DEFAULT}`,
          borderRadius: theme("borderRadius.card"),
          boxShadow: theme("boxShadow.card"),
        },
        ".card-hover": {
          transitionProperty: "border-color, transform, box-shadow",
          transitionDuration: "150ms",
          transitionTimingFunction: "cubic-bezier(0,0,0.2,1)",
        },
        "@media (hover: hover)": {
          ".card-hover:hover": {
            borderColor: palette.line.strong,
            transform: "translateY(-2px)",
          },
        },

        /* Gradient hairline border, drawn with a masked pseudo-element so the card keeps a
         * real background (a gradient `border-image` can't be combined with a fill). */
        ".card-accent": { position: "relative" },
        ".card-accent::after": {
          content: '""',
          position: "absolute",
          inset: "0",
          borderRadius: "inherit",
          padding: "1px",
          background: "linear-gradient(135deg, rgb(124 92 255 / 0.75), rgb(34 211 238 / 0.45) 55%, transparent)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        },

        ".hairline": {
          height: "1px",
          border: "0",
          backgroundImage: theme("backgroundImage.grad-hairline"),
        },

        /* ---------------------------------------------------------------- controls */
        /* Six states, treated as one system: resting, hover, focus, pressed, disabled, loading.
         * Press feedback is a 1px drop — physical, and under the 100ms perception threshold. */
        ".btn": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          minHeight: "2.5rem", // 40px — touch target floor
          padding: "0.5rem 1rem",
          borderRadius: theme("borderRadius.ctl"),
          fontSize: "0.875rem",
          fontWeight: "500",
          lineHeight: "1.25rem",
          whiteSpace: "nowrap",
          cursor: "pointer",
          transitionProperty: "background-color, border-color, color, box-shadow, transform, opacity",
          transitionDuration: "120ms",
          transitionTimingFunction: "cubic-bezier(0,0,0.2,1)",
        },
        ".btn:active:not(:disabled)": { transform: "translateY(1px)" },
        ".btn:disabled": { opacity: "0.45", cursor: "not-allowed" },

        ".btn-primary": {
          color: "#FFFFFF",
          backgroundImage: theme("backgroundImage.grad-accent-r"),
          backgroundSize: "150% 100%",
          border: "1px solid transparent",
          boxShadow: theme("boxShadow.glow-accent"),
        },
        "@media (hover: hover)": {
          ".btn-primary:hover:not(:disabled)": { backgroundPosition: "100% 50%", filter: "brightness(1.08)" },
        },

        ".btn-secondary": {
          color: palette.fg.DEFAULT,
          backgroundColor: palette.surface[2],
          border: `1px solid ${palette.line.strong}`,
        },
        "@media (hover: hover)": {
          ".btn-secondary:hover:not(:disabled)": { backgroundColor: palette.surface[3], borderColor: "#3A4358" },
        },

        ".btn-ghost": {
          color: palette.fg.muted,
          backgroundColor: "transparent",
          border: "1px solid transparent",
        },
        "@media (hover: hover)": {
          ".btn-ghost:hover:not(:disabled)": { color: palette.fg.DEFAULT, backgroundColor: palette.surface[2] },
        },

        ".input": {
          width: "100%",
          minHeight: "2.5rem",
          padding: "0.5rem 0.75rem",
          borderRadius: theme("borderRadius.ctl"),
          backgroundColor: palette.base,
          border: `1px solid ${palette.line.strong}`,
          color: palette.fg.DEFAULT,
          fontSize: "0.875rem",
          transitionProperty: "border-color, box-shadow",
          transitionDuration: "120ms",
          transitionTimingFunction: "cubic-bezier(0,0,0.2,1)",
        },
        ".input::placeholder": { color: palette.fg.subtle },
        ".input:focus": {
          borderColor: palette.accent.DEFAULT,
          boxShadow: "0 0 0 3px rgb(124 92 255 / 0.16)",
        },

        /* ---------------------------------------------------------------- content */
        ".chip": {
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.1875rem 0.5rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: "500",
          lineHeight: "1rem",
          border: "1px solid transparent",
        },

        ".gradient-text": {
          backgroundImage: theme("backgroundImage.grad-accent"),
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        },

        /* Skeletons reserve the real shape, and the sweep is masked inside the block so it
         * can't bleed over neighbouring content. */
        ".skeleton": {
          position: "relative",
          overflow: "hidden",
          backgroundColor: palette.surface[2],
          borderRadius: theme("borderRadius.ctl"),
        },
        ".skeleton::after": {
          content: '""',
          position: "absolute",
          inset: "0",
          transform: "translateX(-100%)",
          backgroundImage: theme("backgroundImage.shimmer"),
          animation: theme("animation.shimmer"),
        },

        ".mono": {
          fontFamily: `var(--font-mono), ${defaultTheme.fontFamily.mono.join(", ")}`,
          fontVariantNumeric: "tabular-nums",
        },
      });
    }),
  ],
};

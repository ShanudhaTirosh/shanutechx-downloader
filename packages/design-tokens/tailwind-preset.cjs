/**
 * Shared Tailwind preset — import from apps/renderer/tailwind.config.js:
 *   presets: [require('@shanutechx/design-tokens/tailwind-preset.cjs')]
 */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#7c3aed",
          "primary-hover": "#6d28d9",
          secondary: "#06b6d4",
          "secondary-hover": "#0891b2",
        },
        surface: {
          base: "#0a0a0f",
          raised: "rgba(255, 255, 255, 0.04)",
          "raised-hover": "rgba(255, 255, 255, 0.07)",
          border: "rgba(255, 255, 255, 0.08)",
          "border-strong": "rgba(255, 255, 255, 0.14)",
        },
        status: {
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
        "brand-glow": "radial-gradient(circle at 30% 20%, rgba(124,58,237,0.25), transparent 60%)",
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
};

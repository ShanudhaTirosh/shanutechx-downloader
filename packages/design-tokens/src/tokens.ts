/**
 * SHANUTECHX brand design tokens — single source of truth.
 * Consumed by apps/renderer/tailwind.config.js so Tailwind classes and any
 * future non-Tailwind surface (e.g. a marketing page, Figma export) stay in sync.
 */

export const colors = {
  brand: {
    primary: "#7c3aed",
    primaryHover: "#6d28d9",
    primaryMuted: "rgba(124, 58, 237, 0.15)",
    secondary: "#06b6d4",
    secondaryHover: "#0891b2",
    secondaryMuted: "rgba(6, 182, 212, 0.15)",
  },
  surface: {
    base: "#0a0a0f",
    raised: "rgba(255, 255, 255, 0.04)",
    raisedHover: "rgba(255, 255, 255, 0.07)",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.14)",
  },
  status: {
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
  },
  text: {
    primary: "#f4f4f5",
    secondary: "#a1a1aa",
    muted: "#71717a",
  },
} as const;

export const gradients = {
  brand: "linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)",
  glow: "radial-gradient(circle at 30% 20%, rgba(124,58,237,0.25), transparent 60%)",
} as const;

export const radii = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
} as const;

export const fonts = {
  ui: '"Inter", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const motion = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "400ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const layout = {
  sidebarCollapsed: 64,
  sidebarExpanded: 220,
  titleBarHeight: 40,
} as const;

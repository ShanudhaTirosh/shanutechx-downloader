import type { Transition } from "framer-motion";

/**
 * Spring presets, in the spirit of kinetics.colorion.co: interface motion
 * driven by physical parameters (stiffness/damping/mass) instead of
 * fixed-duration easing curves, so interactions feel like they have real
 * weight and settle naturally instead of stopping abruptly.
 *
 * Pick by feel, not by component:
 *  - snappy  — small, frequent things: buttons, toggles, icon presses
 *  - gentle  — larger surfaces: cards, panels, page sections
 *  - bouncy  — a little overshoot for delight: success states, new items
 *  - firm    — no overshoot at all: progress bars, anything numeric/precise
 */
export const springs = {
  snappy: { type: "spring", stiffness: 500, damping: 30, mass: 0.7 } satisfies Transition,
  gentle: { type: "spring", stiffness: 260, damping: 28, mass: 1 } satisfies Transition,
  bouncy: { type: "spring", stiffness: 420, damping: 18, mass: 0.8 } satisfies Transition,
  firm: { type: "spring", stiffness: 300, damping: 40, mass: 1 } satisfies Transition,
} as const;

/**
 * Shared list-item entrance/exit for cards that stream in (downloads,
 * torrents, history rows). Use as `variants={listItem} initial="initial"
 * animate="animate" exit="exit"` so it also participates in a parent's
 * `staggerContainer` (variant propagation only works through named variants,
 * not inline initial/animate props).
 */
export const listItem = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springs.gentle },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
} as const;

/**
 * Stagger wrapper for a list container — apply as `variants={staggerContainer}
 * initial="initial" animate="animate"` on the parent; children opt in with
 * `listItem` (which shares the same "initial"/"animate" variant names).
 */
export const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05 } },
} as const;

/** A short, sharp horizontal shake — used for inline validation errors instead of a toast-only response. */
export const shake: Transition = { type: "keyframes", ease: "easeInOut", duration: 0.4 };
export const shakeKeyframes = [0, -8, 8, -6, 6, -3, 3, 0];

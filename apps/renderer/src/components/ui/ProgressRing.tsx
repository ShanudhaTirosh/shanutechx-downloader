import { motion } from "framer-motion";
import { springs } from "../../lib/motion";

interface ProgressRingProps {
  /** 0-100, or null for an indeterminate/unknown-total state — never fabricate a fake percentage */
  percent: number | null;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({ percent, size = 44, strokeWidth = 4 }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isIndeterminate = percent === null;
  const offset = isIndeterminate ? circumference * 0.25 : circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className={isIndeterminate ? "animate-spin" : ""} style={{ animationDuration: "1.4s" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#ring-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: offset }}
        // A "firm" spring (no overshoot) — the ring should never visibly
        // pass 100% and bounce back, but it should still settle with real
        // weight instead of a linear/eased tween.
        transition={springs.firm}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

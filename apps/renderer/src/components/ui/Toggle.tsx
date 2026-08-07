import { motion } from "framer-motion";
import clsx from "clsx";
import { springs } from "../../lib/motion";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={clsx("inline-flex items-center gap-3 select-none", disabled && "opacity-50")}>
      <motion.button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        whileTap={disabled ? undefined : { scale: 0.92 }}
        transition={springs.snappy}
        className={clsx(
          "relative h-6 w-11 rounded-full focus-ring transition-colors duration-200",
          checked ? "bg-brand-gradient" : "bg-surface-raised border border-surface-border",
        )}
      >
        {/* The thumb travels on a real spring (slight overshoot) rather than
            an eased CSS transition — the signature Kinetics "toggle" feel. */}
        <motion.span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 20 : 0 }}
          transition={springs.bouncy}
        />
      </motion.button>
      {label && <span className="text-sm text-zinc-300">{label}</span>}
    </label>
  );
}

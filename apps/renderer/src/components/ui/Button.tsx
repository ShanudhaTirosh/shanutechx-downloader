import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { springs } from "../../lib/motion";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Built directly on framer-motion's own button prop type (rather than
// React's ButtonHTMLAttributes) so there's no overlap to reconcile between
// native DOM handlers (onDrag, onAnimationStart, ...) and framer-motion's
// gesture/animation props of the same name.
interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner in place of the leading icon and disables the button — for async actions (add URL, start convert, etc). */
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-gradient text-white shadow-lg shadow-brand-primary/20 hover:brightness-110",
  secondary: "bg-surface-raised border border-surface-border text-zinc-100 hover:bg-surface-raised-hover",
  ghost: "bg-transparent text-zinc-300 hover:bg-surface-raised",
  danger: "bg-status-danger/10 text-status-danger border border-status-danger/30 hover:bg-status-danger/20",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-base px-5 py-2.5 gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      disabled={disabled || loading}
      whileHover={disabled || loading ? undefined : { y: -1 }}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={springs.snappy}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl font-medium transition-colors duration-150 focus-ring disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin" />}
      {children}
    </motion.button>
  ),
);
Button.displayName = "Button";

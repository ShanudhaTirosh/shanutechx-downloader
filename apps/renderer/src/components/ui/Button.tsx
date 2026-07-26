import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
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
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 focus-ring disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

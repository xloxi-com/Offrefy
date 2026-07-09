import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../utils/cn";

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "variant"
> & {
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
};

export function Button({
  className,
  variant = "outline",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  const sizeClass =
    size === "sm" ? "h-8 min-w-8 px-0" : "h-9 min-w-9 px-3 text-sm";

  const variantClass =
    variant === "outline"
      ? "bg-[var(--p-color-bg-surface,#fff)] hover:bg-[var(--p-color-bg-fill-transparent-hover,rgba(0,0,0,0.06))] active:bg-[var(--p-color-bg-fill-transparent-active,rgba(0,0,0,0.08))]"
      : "bg-transparent hover:bg-[var(--p-color-bg-fill-transparent-hover,rgba(0,0,0,0.06))]";

  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center border-0 text-(--p-color-text,#202223) transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--p-color-border-focus,#1a73e8) disabled:cursor-not-allowed disabled:opacity-40",
        sizeClass,
        variantClass,
        className,
      )}
      {...props}
    />
  );
}

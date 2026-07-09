import type { HTMLAttributes } from "react";

import { cn } from "../../utils/cn";

export function ButtonGroup({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex h-8 items-stretch rounded-md border shadow-[0_1px_0_0_rgba(0,0,0,0.05)]",
        className,
      )}
      style={{
        borderColor: "var(--p-color-border, #c9cccf)",
        backgroundColor: "var(--p-color-bg-surface, #fff)",
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ButtonGroupText({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 min-w-12 items-center justify-center border-x px-3 text-sm font-semibold text-(--p-color-text,#202223) tabular-nums",
        className,
      )}
      style={{
        borderColor: "var(--p-color-border, #c9cccf)",
        backgroundColor: "var(--p-color-bg-surface-secondary, #f6f6f7)",
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

import type {
  ComponentType,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  SVGProps,
} from "react";
import {
  ArrowUpIcon,
  AutomationIcon,
  CalendarIcon,
  CartIcon,
  DeleteIcon,
  DesktopIcon,
  DiscountIcon,
  DuplicateIcon,
  MenuHorizontalIcon,
  MobileIcon,
  RedoIcon,
  RefreshIcon,
  ResetIcon,
  SettingsIcon,
  UndoIcon,
  ViewIcon,
} from "@shopify/polaris-icons";

type IconSource = ComponentType<SVGProps<SVGSVGElement>>;

const ICON_NAMES = new Map<IconSource, string>([
  [DesktopIcon, "desktop"],
  [MobileIcon, "mobile"],
  [ResetIcon, "reset"],
  [AutomationIcon, "automation"],
  [DuplicateIcon, "duplicate"],
  [DeleteIcon, "delete"],
  [ArrowUpIcon, "arrow-up"],
  [UndoIcon, "undo"],
  [RedoIcon, "redo"],
  [CalendarIcon, "calendar"],
  [RefreshIcon, "refresh"],
  [ViewIcon, "view"],
  [CartIcon, "cart"],
  [DiscountIcon, "discount"],
  [MenuHorizontalIcon, "menu-horizontal"],
  [SettingsIcon, "settings"],
]);

export type AppButtonProps = {
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  variant?: "primary" | "secondary" | "tertiary" | "plain" | "monochromePlain";
  tone?: "critical" | "success" | "primary" | string;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconSource | string;
  accessibilityLabel?: string;
  url?: string;
  external?: boolean;
  fullWidth?: boolean;
  size?: "slim" | "medium" | "large" | "micro";
  pressed?: boolean;
  submit?: boolean;
  disclosure?: boolean | "select" | "up" | "down";
  textAlign?: "left" | "center" | "right" | "start" | "end";
  id?: string;
  target?: string;
  download?: string | boolean;
  /** Ignored — kept so Polaris React call sites type-check. */
  ariaControls?: string;
  ariaExpanded?: boolean;
};

function mapVariant(
  variant: AppButtonProps["variant"],
  pressed?: boolean,
): "primary" | "secondary" | "tertiary" | "auto" {
  if (pressed) return "primary";
  if (variant === "primary") return "primary";
  if (variant === "tertiary" || variant === "plain" || variant === "monochromePlain") {
    return "tertiary";
  }
  return "secondary";
}

function resolveIcon(icon: AppButtonProps["icon"]): string | undefined {
  if (!icon) return undefined;
  if (typeof icon === "string") return icon;
  return ICON_NAMES.get(icon);
}

/**
 * Drop-in for Polaris React `Button`, rendered with App Home `s-button`.
 * Behavior (onClick, href, loading, disabled) stays the same.
 */
export function AppButton({
  children,
  onClick,
  onPointerDown,
  variant,
  tone,
  disabled,
  loading,
  icon,
  accessibilityLabel,
  url,
  external,
  fullWidth,
  pressed,
  submit,
  disclosure,
  id,
  target,
  download,
}: AppButtonProps) {
  const iconName =
    resolveIcon(icon) ||
    (disclosure ? (disclosure === "up" ? "caret-up" : "caret-down") : undefined);
  const sTone =
    tone === "critical" || tone === "neutral" || tone === "auto"
      ? tone
      : undefined;
  const href = url || undefined;
  const resolvedTarget = target || (external ? "_blank" : undefined);

  /* Polaris web-component typings omit some DOM handlers we still need. */
  const SButton = "s-button" as unknown as ComponentType<Record<string, unknown>>;

  return (
    <SButton
      id={id}
      variant={mapVariant(variant, pressed)}
      tone={sTone}
      disabled={disabled || undefined}
      loading={loading || undefined}
      href={href}
      target={resolvedTarget}
      download={typeof download === "string" ? download : undefined}
      accessibilityLabel={accessibilityLabel}
      inlineSize={fullWidth ? "fill" : undefined}
      icon={iconName}
      type={submit ? "submit" : "button"}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {children}
    </SButton>
  );
}

/** Layout stand-in for Polaris `ButtonGroup` around `s-button`s. */
export function AppButtonGroup({
  children,
  gap = "tight",
}: {
  children: ReactNode;
  variant?: "segmented";
  gap?: "extraTight" | "tight" | "loose" | string;
  noWrap?: boolean;
}) {
  const sGap =
    gap === "loose" ? "base" : gap === "extraTight" ? "small-200" : "small-200";
  return (
    <s-stack direction="inline" gap={sGap} alignItems="center">
      {children}
    </s-stack>
  );
}

/** Alias so call sites can keep writing `<Button />`. */
export { AppButton as Button, AppButtonGroup as ButtonGroup };

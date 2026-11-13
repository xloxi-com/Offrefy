import {
  DEFAULT_WIDGET_DISPLAY,
  normalizeVolumeDiscountWidgetDisplay,
  type VolumeDiscountWidgetDisplay,
} from "./widgetDisplay";

/** BOGO-friendly defaults on top of shared widget display (match storefront). */
export function defaultBogoWidgetDisplay(
  displayName?: string,
): VolumeDiscountWidgetDisplay {
  return normalizeVolumeDiscountWidgetDisplay({
    ...DEFAULT_WIDGET_DISPLAY,
    widgetHeading: (displayName || "").trim() || "Buy X, Get Y",
    ctaLabel: "Add to cart",
    footnote:
      "Discount applies automatically when Buy and Get quantities are in your cart.",
    showCountdown: true,
    ctaButtonAction: "add_to_cart_open_drawer",
    primaryColor: "#18181b",
    primaryHoverColor: "#3f3f46",
    selectedBgColor: "#ffffff",
    cardBorderColor: "#e8e8ea",
  });
}

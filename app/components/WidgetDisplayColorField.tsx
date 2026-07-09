import {
  Button,
  ColorPicker,
  Popover,
  TextField,
  hexToRgb,
  hsbToHex,
  rgbToHsb,
} from "@shopify/polaris";
import type { HSBAColor } from "@shopify/polaris";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  normalizeWidgetColor,
  parseWidgetColor,
  rgbaToCssString,
} from "../utils/widgetDisplay";

function valueToHsba(value: string): HSBAColor {
  const p = parseWidgetColor(value);
  if (!p) {
    return { hue: 0, saturation: 0, brightness: 0.92, alpha: 1 };
  }
  const hsb = rgbToHsb({ red: p.r, green: p.g, blue: p.b });
  return { ...hsb, alpha: p.a };
}

function hsbaToWidgetCss(color: HSBAColor): string {
  const hex = hsbToHex({
    hue: color.hue,
    saturation: color.saturation,
    brightness: color.brightness,
  });
  const rgb = hexToRgb(hex);
  const a = color.alpha ?? 1;
  return rgbaToCssString({
    r: rgb.red,
    g: rgb.green,
    b: rgb.blue,
    a,
  });
}

export type WidgetDisplayColorFieldProps = {
  label: string;
  value: string;
  onChange: (cssColor: string) => void;
};

/**
 * Text field + Polaris `ColorPicker` with alpha. Values are stored as `#rrggbb` or `rgba(...)`.
 */
export function WidgetDisplayColorField({
  label,
  value,
  onChange,
}: WidgetDisplayColorFieldProps) {
  const [popoverActive, setPopoverActive] = useState(false);
  const [textDraft, setTextDraft] = useState(value);

  useEffect(() => {
    setTextDraft(value);
  }, [value]);

  const pickerColor = useMemo(() => valueToHsba(value), [value]);

  const previewStyle = useMemo((): CSSProperties => {
    const p = parseWidgetColor(value);
    if (!p) {
      return {
        backgroundColor: "#e4e5e7",
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
      };
    }
    const css = rgbaToCssString(p);
    if (p.a >= 0.999) {
      return {
        backgroundColor: css,
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
      };
    }
    return {
      backgroundImage: `linear-gradient(${css}, ${css}), repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)`,
      backgroundSize: "100% 100%, 6px 6px",
      boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
    };
  }, [value]);

  return (
    <TextField
      label={label}
      value={textDraft}
      onChange={setTextDraft}
      onBlur={() => {
        const next = normalizeWidgetColor(textDraft, value);
        setTextDraft(next);
        if (next !== value) onChange(next);
      }}
      autoComplete="off"
      monospaced
      connectedLeft={
        <Popover
          active={popoverActive}
          preferredAlignment="left"
          activator={
            <Button
              onClick={() => setPopoverActive((open) => !open)}
              variant="tertiary"
              accessibilityLabel={`Open color picker for ${label}`}
              icon={
                <span
                  style={{
                    display: "block",
                    width: "1.75rem",
                    height: "1.75rem",
                    borderRadius: "6px",
                    ...previewStyle,
                  }}
                />
              }
            />
          }
          onClose={() => setPopoverActive(false)}
          ariaHaspopup={true}
          autofocusTarget="none"
        >
          <Popover.Section>
            <ColorPicker
              allowAlpha
              color={pickerColor}
              onChange={(color: HSBAColor) => {
                onChange(hsbaToWidgetCss(color));
              }}
            />
          </Popover.Section>
        </Popover>
      }
    />
  );
}

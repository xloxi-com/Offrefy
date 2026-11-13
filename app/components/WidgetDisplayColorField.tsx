import { useEffect, useState } from "react";

import { normalizeWidgetColor } from "../utils/widgetDisplay";

export type WidgetDisplayColorFieldProps = {
  label: string;
  value: string;
  onChange: (cssColor: string) => void;
};

/**
 * Polaris web `s-color-field` (hex/rgba). Same `onChange(cssColor)` contract as before.
 */
export function WidgetDisplayColorField({
  label,
  value,
  onChange,
}: WidgetDisplayColorFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (raw: string) => {
    const next = normalizeWidgetColor(raw, value);
    setDraft(next);
    if (next !== value) onChange(next);
  };

  return (
    // Polaris web: s-color-field — same normalizeWidgetColor + onChange
    <s-color-field
      label={label}
      value={draft}
      alpha
      autocomplete="off"
      onChange={(event) => {
        const next = String(event.currentTarget.value ?? "");
        setDraft(next);
        if (next) commit(next);
      }}
      onInput={(event) => {
        setDraft(String(event.currentTarget.value ?? ""));
      }}
      onBlur={() => commit(draft)}
    />
  );
}

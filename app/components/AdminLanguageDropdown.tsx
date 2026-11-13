export type AdminLanguageOption = {
  label: string;
  value: string;
};

export type AdminLanguageDropdownProps = {
  label: string;
  value: string;
  options: AdminLanguageOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  helpText?: string;
};

/**
 * App Home `s-select` dropdown (Polaris web components Select).
 * Used for admin language, customer type, and similar single-choice fields.
 */
export function AdminLanguageDropdown({
  label,
  value,
  options,
  onChange,
  disabled = false,
  helpText,
}: AdminLanguageDropdownProps) {
  return (
    <s-select
      label={label}
      value={value}
      disabled={disabled || undefined}
      details={helpText}
      onChange={(event) => {
        const next = String(event.currentTarget.value || "");
        if (next) onChange(next);
      }}
      onInput={(event) => {
        const next = String(event.currentTarget.value || "");
        if (next) onChange(next);
      }}
    >
      {options.map((option) => (
        <s-option key={option.value} value={option.value}>
          {option.label}
        </s-option>
      ))}
    </s-select>
  );
}

export type CampaignSortOption = {
  label: string;
  value: string;
};

export type AnalyticsCampaignSortDropdownProps = {
  label?: string;
  value: string;
  options: CampaignSortOption[];
  onChange: (value: string) => void;
};

/**
 * Polaris web: s-select — same sort value / onChange behavior.
 */
export function AnalyticsCampaignSortDropdown({
  label = "Sort",
  value,
  options,
  onChange,
}: AnalyticsCampaignSortDropdownProps) {
  return (
    <s-select
      label={label}
      labelAccessibilityVisibility="exclusive"
      value={value}
      onChange={(event) => {
        onChange(String(event.currentTarget.value ?? ""));
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

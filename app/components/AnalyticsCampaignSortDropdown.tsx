import { useMemo, useState } from "react";
import { ActionList, Button, Popover } from "@shopify/polaris";

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

export function AnalyticsCampaignSortDropdown({
  label = "Sort",
  value,
  options,
  onChange,
}: AnalyticsCampaignSortDropdownProps) {
  const [active, setActive] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? label,
    [label, options, value],
  );

  return (
    <Popover
      active={active}
      activator={
        <Button
          onClick={() => setActive((open) => !open)}
          disclosure="select"
          fullWidth
          textAlign="left"
          accessibilityLabel={label}
        >
          {selectedLabel}
        </Button>
      }
      onClose={() => setActive(false)}
      preferredAlignment="right"
      autofocusTarget="first-node"
    >
      <ActionList
        actionRole="menuitemradio"
        items={options.map((option) => ({
          content: option.label,
          active: option.value === value,
          onAction: () => {
            onChange(option.value);
            setActive(false);
          },
        }))}
      />
    </Popover>
  );
}

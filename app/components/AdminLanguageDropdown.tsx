import { useMemo, useState } from "react";
import { ActionList, BlockStack, Button, Popover, Text } from "@shopify/polaris";

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
};

/**
 * Polaris Popover + ActionList language picker (custom dropdown, not native Select).
 */
export function AdminLanguageDropdown({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: AdminLanguageDropdownProps) {
  const [active, setActive] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? label,
    [label, options, value],
  );

  return (
    <BlockStack gap="100">
      <Text as="p" variant="bodyMd">
        {label}
      </Text>
      <Popover
        active={active}
        activator={
          <Button
            onClick={() => setActive((open) => !open)}
            disclosure="select"
            fullWidth
            textAlign="left"
            disabled={disabled}
            accessibilityLabel={label}
          >
            {selectedLabel}
          </Button>
        }
        onClose={() => setActive(false)}
        preferredAlignment="left"
        fullWidth
        autofocusTarget="first-node"
      >
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
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
        </div>
      </Popover>
    </BlockStack>
  );
}

import { type ComponentType, type MouseEventHandler } from "react";
import { useAdminI18n } from "./AdminI18nProvider";

export type SetupGuideButton = {
  content: string;
  props?: {
    url?: string;
    external?: boolean;
    onClick?: MouseEventHandler<HTMLElement>;
    loading?: boolean;
    disabled?: boolean;
    icon?: string;
    target?: string;
  };
};

export type SetupGuideItem = {
  id: number | string;
  title: string;
  description: string;
  complete: boolean;
  image?: { url: string; alt: string };
  primaryButton?: SetupGuideButton;
  secondaryButton?: SetupGuideButton;
};

type SetupGuideProps = {
  items: SetupGuideItem[];
  onDismiss: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  title?: string;
  description?: string;
};

/**
 * Setup guide — all steps always open.
 * Status via icon (no checkbox, no accordion).
 */
export function SetupGuide({
  items,
  onDismiss,
  onRefresh,
  refreshing = false,
  title,
  description,
}: SetupGuideProps) {
  const { t } = useAdminI18n();
  const heading = title ?? t("home.setupGuideTitle");
  const subheading = description ?? t("home.setupGuideDescription");
  const done = items.filter((item) => item.complete).length;
  const total = items.length;

  return (
    <s-section heading={heading} subheading={subheading}>
      <s-text slot="supplemental" color="subdued">
        {t("setup.completed", { done, total })}
      </s-text>

      {onRefresh ? (
        <s-button
          slot="secondary-actions"
          accessibilityLabel={t("setup.reload")}
          variant="tertiary"
          tone="neutral"
          icon="refresh"
          loading={refreshing || undefined}
          onClick={onRefresh}
        />
      ) : null}
      <s-button
        slot="secondary-actions"
        accessibilityLabel={t("setup.dismissGuide")}
        variant="tertiary"
        tone="neutral"
        icon="x"
        onClick={onDismiss}
      />

      <s-stack gap="base">
        {items.map((item, index) => (
          <s-stack key={item.id} gap="base">
            {index > 0 ? <s-divider /> : null}

            <s-grid
              gridTemplateColumns="auto 1fr auto"
              gap="base"
              alignItems="start"
            >
              <s-icon
                type={item.complete ? "check-circle" : "circle"}
                tone={item.complete ? "success" : undefined}
                color={item.complete ? undefined : "subdued"}
                accessibilityLabel={
                  item.complete
                    ? t("setup.checkComplete")
                    : item.title
                }
              />

              <s-stack gap="small-200">
                <s-heading>{item.title}</s-heading>
                <s-paragraph color="subdued">{item.description}</s-paragraph>
                <s-stack direction="inline" gap="small-200">
                  {item.primaryButton ? (
                    <Action button={item.primaryButton} variant="secondary" />
                  ) : null}
                  {item.secondaryButton ? (
                    <Action button={item.secondaryButton} variant="tertiary" />
                  ) : null}
                </s-stack>
              </s-stack>

              {item.image ? (
                <s-box maxBlockSize="80px" maxInlineSize="80px">
                  <s-image src={item.image.url} alt={item.image.alt} />
                </s-box>
              ) : null}
            </s-grid>
          </s-stack>
        ))}
      </s-stack>
    </s-section>
  );
}

function Action({
  button,
  variant,
}: {
  button: SetupGuideButton;
  variant: "secondary" | "tertiary";
}) {
  const p = button.props;
  const SButton = "s-button" as unknown as ComponentType<
    Record<string, unknown>
  >;
  return (
    <SButton
      variant={variant}
      tone="neutral"
      href={p?.url}
      target={p?.target || (p?.external ? "_blank" : undefined)}
      loading={p?.loading || undefined}
      disabled={p?.disabled || undefined}
      icon={p?.icon}
      onClick={p?.onClick}
    >
      {button.content}
    </SButton>
  );
}

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "./AppButton";
import { useAdminI18n } from "./AdminI18nProvider";

export type SetupGuideButton = {
  content: string;
  props?: Partial<
    Pick<
      ComponentProps<typeof Button>,
      | "url"
      | "external"
      | "onClick"
      | "loading"
      | "disabled"
      | "icon"
      | "target"
      | "download"
    >
  >;
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
 * New Polaris App Home setup-guide (homepage template).
 * Status-driven complete icons — same onDismiss / onRefresh / items handlers.
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
  const resolvedTitle = title ?? t("home.setupGuideTitle");
  const resolvedDescription =
    description ?? t("home.setupGuideDescription");
  const firstIncompleteId =
    items.find((item) => !item.complete)?.id ?? items[0]?.id ?? null;
  const [expandedId, setExpandedId] = useState<SetupGuideItem["id"] | null>(
    firstIncompleteId,
  );
  const completedCount = items.filter((item) => item.complete).length;
  const prevCompleted = useRef(completedCount);
  const allDone = completedCount === items.length && items.length > 0;

  useEffect(() => {
    if (completedCount === prevCompleted.current) return;
    prevCompleted.current = completedCount;
    setExpandedId(
      items.find((item) => !item.complete)?.id ?? items[0]?.id ?? null,
    );
  }, [completedCount, items]);

  return (
    <s-section heading={resolvedTitle} subheading={resolvedDescription}>
      <s-text slot="supplemental" color="subdued">
        {allDone
          ? t("setup.done")
          : t("setup.completed", {
              done: completedCount,
              total: items.length,
            })}
      </s-text>
      {onRefresh ? (
        <s-button
          slot="secondary-actions"
          variant="tertiary"
          tone="neutral"
          icon="refresh"
          loading={refreshing || undefined}
          accessibilityLabel={t("setup.reload")}
          onClick={onRefresh}
        />
      ) : null}
      <s-button
        slot="secondary-actions"
        variant="tertiary"
        tone="neutral"
        icon="x"
        accessibilityLabel={t("setup.dismiss")}
        onClick={onDismiss}
      />

      <s-stack direction="block" gap="small">
        {items.map((item, index) => {
          const open = expandedId === item.id;
          return (
            <s-stack key={item.id} direction="block" gap="small">
              {index > 0 ? <s-divider /> : null}
              <s-grid
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-stack
                  direction="inline"
                  gap="small"
                  alignItems="center"
                >
                  <s-icon
                    type={item.complete ? "check-circle" : "circle"}
                    tone={item.complete ? "success" : undefined}
                    color={item.complete ? undefined : "subdued"}
                  />
                  <s-text type="strong">{item.title}</s-text>
                </s-stack>
                <s-button
                  variant="tertiary"
                  tone="neutral"
                  icon={open ? "chevron-up" : "chevron-down"}
                  accessibilityLabel={item.title}
                  onClick={() => setExpandedId(open ? null : item.id)}
                />
              </s-grid>

              {open ? (
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                  paddingInlineStart="large-200"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-paragraph color="subdued">
                      {item.description}
                    </s-paragraph>
                    <s-stack direction="inline" gap="small-200">
                      {item.primaryButton ? (
                        <Button
                          variant="primary"
                          {...item.primaryButton.props}
                        >
                          {item.primaryButton.content}
                        </Button>
                      ) : null}
                      {item.secondaryButton ? (
                        <Button
                          variant="tertiary"
                          {...item.secondaryButton.props}
                        >
                          {item.secondaryButton.content}
                        </Button>
                      ) : null}
                    </s-stack>
                  </s-stack>
                  {item.image ? (
                    <s-box maxBlockSize="80px" maxInlineSize="80px">
                      <s-image
                        src={item.image.url}
                        alt={item.image.alt}
                        objectFit="contain"
                      />
                    </s-box>
                  ) : null}
                </s-grid>
              ) : null}
            </s-stack>
          );
        })}
      </s-stack>

      {allDone ? (
        <s-stack
          direction="inline"
          justifyContent="end"
          paddingBlockStart="base"
        >
          <s-button variant="secondary" onClick={onDismiss}>
            {t("setup.dismissGuide")}
          </s-button>
        </s-stack>
      ) : null}
    </s-section>
  );
}

import { useId, useState, type ComponentProps } from "react";
import {
  ActionList,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Collapsible,
  Icon,
  Image,
  InlineStack,
  Popover,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MenuHorizontalIcon,
  XIcon,
} from "@shopify/polaris-icons";

import { useAdminI18n } from "./AdminI18nProvider";
import styles from "./SetupGuide.module.css";

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
  title?: string;
  description?: string;
};

export function SetupGuide({
  items,
  onDismiss,
  title,
  description,
}: SetupGuideProps) {
  const { t } = useAdminI18n();
  const resolvedTitle = title ?? t("home.setupGuideTitle");
  const resolvedDescription =
    description ?? t("home.setupGuideDescription");
  const firstIncompleteId =
    items.find((item) => !item.complete)?.id ?? items[0]?.id ?? null;
  const [expanded, setExpanded] = useState<SetupGuideItem["id"] | null>(
    firstIncompleteId,
  );
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [popoverActive, setPopoverActive] = useState(false);
  const accessId = useId();
  const completedItemsLength = items.filter((item) => item.complete).length;

  return (
    <Card padding="0">
      <Box padding="400" paddingBlockEnd="400">
        <BlockStack>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingMd">
              {resolvedTitle}
            </Text>
            <ButtonGroup gap="tight" noWrap>
              <Popover
                active={popoverActive}
                onClose={() => setPopoverActive((prev) => !prev)}
                activator={
                  <Button
                    onClick={() => setPopoverActive((prev) => !prev)}
                    variant="tertiary"
                    icon={MenuHorizontalIcon}
                    accessibilityLabel={t("setup.options")}
                  />
                }
              >
                <ActionList
                  actionRole="menuitem"
                  items={[
                    {
                      content: t("setup.dismiss"),
                      onAction: onDismiss,
                      prefix: (
                        <div
                          style={{
                            height: "1rem",
                            width: "1rem",
                            paddingTop: ".05rem",
                          }}
                        >
                          <Icon tone="subdued" source={XIcon} />
                        </div>
                      ),
                    },
                  ]}
                />
              </Popover>

              <Button
                variant="tertiary"
                icon={isGuideOpen ? ChevronUpIcon : ChevronDownIcon}
                accessibilityLabel={
                  isGuideOpen ? t("setup.collapse") : t("setup.expand")
                }
                onClick={() => {
                  setIsGuideOpen((prev) => {
                    if (!prev) {
                      setExpanded(
                        items.find((item) => !item.complete)?.id ??
                          items[0]?.id ??
                          null,
                      );
                    }
                    return !prev;
                  });
                }}
                ariaControls={accessId}
              />
            </ButtonGroup>
          </InlineStack>
          <Text as="p" variant="bodyMd">
            {resolvedDescription}
          </Text>
          <div style={{ marginTop: ".8rem" }}>
            <InlineStack blockAlign="center" gap="200">
              {completedItemsLength === items.length ? (
                <div style={{ maxHeight: "1rem" }}>
                  <InlineStack wrap={false} gap="100">
                    <Icon
                      source={CheckIcon}
                      tone="subdued"
                      accessibilityLabel={t("setup.checkComplete")}
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("setup.done")}
                    </Text>
                  </InlineStack>
                </div>
              ) : (
                <Text as="span" variant="bodySm">
                  {t("setup.completed", {
                    done: completedItemsLength,
                    total: items.length,
                  })}
                </Text>
              )}

              {completedItemsLength !== items.length ? (
                <div style={{ width: "100px" }}>
                  <ProgressBar
                    progress={(completedItemsLength / items.length) * 100}
                    size="small"
                    tone="primary"
                    animated
                  />
                </div>
              ) : null}
            </InlineStack>
          </div>
        </BlockStack>
      </Box>
      <Collapsible open={isGuideOpen} id={accessId}>
        <Box padding="200">
          <BlockStack gap="100">
            {items.map((item) => (
              <SetupItem
                key={item.id}
                expanded={expanded === item.id}
                setExpanded={() => setExpanded(item.id)}
                {...item}
              />
            ))}
          </BlockStack>
        </Box>
      </Collapsible>
      {completedItemsLength === items.length ? (
        <Box
          background="bg-surface-secondary"
          borderBlockStartWidth="025"
          borderColor="border-secondary"
          padding="300"
        >
          <InlineStack align="end">
            <Button onClick={onDismiss}>{t("setup.dismissGuide")}</Button>
          </InlineStack>
        </Box>
      ) : null}
    </Card>
  );
}

type SetupItemProps = SetupGuideItem & {
  expanded: boolean;
  setExpanded: () => void;
};

function SetupItem({
  complete,
  expanded,
  setExpanded,
  title,
  description,
  image,
  primaryButton,
  secondaryButton,
  id,
}: SetupItemProps) {
  const { t } = useAdminI18n();
  const collapseId = `setup-item-${id}`;

  return (
    <Box
      borderRadius="200"
      background={expanded ? "bg-surface-active" : undefined}
    >
      <div
        className={`${styles.setupItem} ${expanded ? styles.setupItemExpanded : ""}`}
      >
        <InlineStack gap="200" align="start" blockAlign="start" wrap={false}>
          <div
            className={styles.completeButton}
            aria-label={complete ? t("setup.checkComplete") : undefined}
            aria-hidden={!complete}
            role="img"
          >
            {complete ? (
              <CheckIcon
                style={{
                  width: "1.25rem",
                  height: "1.25rem",
                  borderRadius: "100%",
                  background: "#303030",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fill: "white",
                }}
              />
            ) : (
              outlineSvg
            )}
          </div>
          <div
            className={styles.itemContent}
            onClick={expanded ? undefined : setExpanded}
            onKeyDown={
              expanded
                ? undefined
                : (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpanded();
                    }
                  }
            }
            role={expanded ? undefined : "button"}
            tabIndex={expanded ? undefined : 0}
            style={{
              cursor: expanded ? "default" : "pointer",
              paddingTop: ".15rem",
              width: "100%",
            }}
          >
            <BlockStack gap="300" id={collapseId}>
              <Text as="h4" variant={expanded ? "headingSm" : "bodyMd"}>
                {title}
              </Text>
              <Collapsible open={expanded} id={collapseId}>
                <Box paddingBlockEnd="150" paddingInlineEnd="150">
                  <BlockStack gap="400">
                    <Text as="p" variant="bodyMd">
                      {description}
                    </Text>
                    {primaryButton || secondaryButton ? (
                      <ButtonGroup gap="loose">
                        {primaryButton ? (
                          <Button variant="primary" {...primaryButton.props}>
                            {primaryButton.content}
                          </Button>
                        ) : null}
                        {secondaryButton ? (
                          <Button variant="tertiary" {...secondaryButton.props}>
                            {secondaryButton.content}
                          </Button>
                        ) : null}
                      </ButtonGroup>
                    ) : null}
                  </BlockStack>
                </Box>
              </Collapsible>
            </BlockStack>
            {image && expanded ? (
              <Image
                className={styles.itemImage}
                source={image.url}
                alt={image.alt}
                style={{ maxHeight: "7.75rem" }}
              />
            ) : null}
          </div>
        </InlineStack>
      </div>
    </Box>
  );
}

const outlineSvg = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.5334 2.10692C11.0126 2.03643 11.5024 2 12 2C12.4976 2 12.9874 2.03643 13.4666 2.10692C14.013 2.18729 14.3908 2.6954 14.3104 3.2418C14.23 3.78821 13.7219 4.166 13.1755 4.08563C12.7924 4.02927 12.3999 4 12 4C11.6001 4 11.2076 4.02927 10.8245 4.08563C10.2781 4.166 9.76995 3.78821 9.68958 3.2418C9.6092 2.6954 9.987 2.18729 10.5334 2.10692ZM7.44122 4.17428C7.77056 4.61763 7.67814 5.24401 7.23479 5.57335C6.603 6.04267 6.04267 6.603 5.57335 7.23479C5.24401 7.67814 4.61763 7.77056 4.17428 7.44122C3.73094 7.11188 3.63852 6.4855 3.96785 6.04216C4.55386 5.25329 5.25329 4.55386 6.04216 3.96785C6.4855 3.63852 7.11188 3.73094 7.44122 4.17428ZM16.5588 4.17428C16.8881 3.73094 17.5145 3.63852 17.9578 3.96785C18.7467 4.55386 19.4461 5.25329 20.0321 6.04216C20.3615 6.4855 20.2691 7.11188 19.8257 7.44122C19.3824 7.77056 18.756 7.67814 18.4267 7.23479C17.9573 6.603 17.397 6.04267 16.7652 5.57335C16.3219 5.24401 16.2294 4.61763 16.5588 4.17428ZM3.2418 9.68958C3.78821 9.76995 4.166 10.2781 4.08563 10.8245C4.02927 11.2076 4 11.6001 4 12C4 12.3999 4.02927 12.7924 4.08563 13.1755C4.166 13.7219 3.78821 14.23 3.2418 14.3104C2.6954 14.3908 2.18729 14.013 2.10692 13.4666C2.03643 12.9874 2 12.4976 2 12C2 11.5024 2.03643 11.0126 2.10692 10.5334C2.18729 9.987 2.6954 9.6092 3.2418 9.68958ZM20.7582 9.68958C21.3046 9.6092 21.8127 9.987 21.8931 10.5334C21.9636 11.0126 22 11.5024 22 12C22 12.4976 21.9636 12.9874 21.8931 13.4666C21.8127 14.013 21.3046 14.3908 20.7582 14.3104C20.2118 14.23 19.834 13.7219 19.9144 13.1755C19.9707 12.7924 20 12.3999 20 12C20 11.6001 19.9707 11.2076 19.9144 10.8245C19.834 10.2781 20.2118 9.76995 20.7582 9.68958ZM4.17428 16.5588C4.61763 16.2294 5.24401 16.3219 5.57335 16.7652C6.04267 17.397 6.603 17.9573 7.23479 18.4267C7.67814 18.756 7.77056 19.3824 7.44122 19.8257C7.11188 20.2691 6.4855 20.3615 6.04216 20.0321C5.25329 19.4461 4.55386 18.7467 3.96785 17.9578C3.63852 17.5145 3.73094 16.8881 4.17428 16.5588ZM19.8257 16.5588C20.2691 16.8881 20.3615 17.5145 20.0321 17.9578C19.4461 18.7467 18.7467 19.4461 17.9578 20.0321C17.5145 20.3615 16.8881 20.2691 16.5588 19.8257C16.2294 19.3824 16.3219 18.756 16.7652 18.4267C17.397 17.9573 17.9573 17.397 18.4267 16.7652C18.756 16.3219 19.3824 16.2294 19.8257 16.5588ZM9.68958 20.7582C9.76995 20.2118 10.2781 19.834 10.8245 19.9144C11.2076 19.9707 11.6001 20 12 20C12.3999 20 12.7924 19.9707 13.1755 19.9144C13.7219 19.834 14.23 20.2118 14.3104 20.7582C14.3908 21.3046 14.013 21.8127 13.4666 21.8931C12.9874 21.9636 12.4976 22 12 22C11.5024 22 11.0126 21.9636 10.5334 21.8931C9.987 21.8127 9.6092 21.3046 9.68958 20.7582Z"
      fill="#8A8A8A"
    />
  </svg>
);

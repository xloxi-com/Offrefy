import { useEffect, useMemo, useState } from "react";
import {
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  InlineGrid,
  InlineStack,
  Modal,
  Text,
} from "@shopify/polaris";
import { DesktopIcon, MobileIcon } from "@shopify/polaris-icons";

import { QuantityBreaksTailwindPreview } from "./QuantityBreaksTailwindPreview";
import styles from "./OfferTypePreviewModal.module.css";
import {
  getOfferTypePreviewRows,
  getOfferTypePreviewWidgetDisplay,
} from "../utils/offerTypeSelectPreviewRows";

const DEMO_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&q=80&auto=format&fit=crop";

const VARIANT_LABELS = ["610ml", "400ml", "220ml"] as const;

export type OfferTypePreviewPreset = "quantity" | "volume";

export type OfferTypePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  preset: OfferTypePreviewPreset;
  storefrontPreviewUrl?: string | null;
};

export function OfferTypePreviewModal({
  open,
  onClose,
  preset,
  storefrontPreviewUrl,
}: OfferTypePreviewModalProps) {
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop",
  );

  useEffect(() => {
    if (open) {
      setPreviewDevice("desktop");
    }
  }, [open, preset]);

  useEffect(() => {
    const cls = "vd-offer-type-preview-modal--open";
    if (open) {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => document.body.classList.remove(cls);
  }, [open]);

  const rows = useMemo(() => getOfferTypePreviewRows(preset), [preset]);
  const display = useMemo(
    () => getOfferTypePreviewWidgetDisplay(preset),
    [preset],
  );

  const modalTitle =
    previewDevice === "desktop" ? "Desktop preview" : "Mobile preview";

  const viewportClass =
    previewDevice === "mobile"
      ? `${styles.viewport} ${styles.viewportMobile}`
      : `${styles.viewport} ${styles.viewportDesktop}`;

  const footnote = (
    <BlockStack gap="100">
      <Text as="p" variant="bodyXs" tone="subdued">
        Sample preview (€98 unit base). Live theme may differ.
      </Text>
      {storefrontPreviewUrl && storefrontPreviewUrl.length > 0 ? (
        <Text as="p" variant="bodyXs">
          <Button
            variant="plain"
            url={storefrontPreviewUrl}
            external
            target="_blank"
          >
            View on storefront
          </Button>
        </Text>
      ) : null}
    </BlockStack>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="large"
      limitHeight
      primaryAction={{
        content: "Close",
        onAction: onClose,
      }}
    >
      <Modal.Section>
        <div className={styles.previewFit}>
        <BlockStack gap="300">
          <InlineStack align="end" blockAlign="center">
            <ButtonGroup variant="segmented" noWrap>
              <Button
                pressed={previewDevice === "desktop"}
                icon={DesktopIcon}
                accessibilityLabel="Desktop preview"
                onClick={() => setPreviewDevice("desktop")}
              />
              <Button
                pressed={previewDevice === "mobile"}
                icon={MobileIcon}
                accessibilityLabel="Mobile preview"
                onClick={() => setPreviewDevice("mobile")}
              />
            </ButtonGroup>
          </InlineStack>

          <Card padding="0">
            <div
              className={
                previewDevice === "mobile" ? styles.mobilePreviewShell : undefined
              }
            >
              <Box padding={{ xs: "200", sm: "300", md: "400" }}>
              <InlineGrid
                columns={
                  previewDevice === "mobile" ? 1 : { xs: 1, md: 2 }
                }
                gap={
                  previewDevice === "mobile"
                    ? "300"
                    : { xs: "300", md: "400" }
                }
                alignItems="start"
              >
                <div className={styles.imageFrame}>
                  <img
                    className={styles.image}
                    src={DEMO_PRODUCT_IMAGE}
                    alt=""
                    decoding="async"
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>

                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="headingMd">
                      <span className={styles.productTitle}>
                        Balance Natural Face Wash
                      </span>
                    </Text>
                    <Text as="p" variant="headingSm">
                      €50,00
                    </Text>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      Variants
                    </Text>
                    <InlineStack gap="150" wrap>
                      {VARIANT_LABELS.map((label, i) => (
                        <Button
                          key={label}
                          size="slim"
                          variant={i === 0 ? "primary" : "secondary"}
                          disabled
                        >
                          {label}
                        </Button>
                      ))}
                    </InlineStack>
                  </BlockStack>

                  <Box
                    padding="0"
                    background="bg-surface-secondary"
                    borderRadius="200"
                    overflowX="hidden"
                  >
                    <div className={viewportClass}>
                      <Box padding={{ xs: "200", sm: "300" }} background="bg-surface">
                        <QuantityBreaksTailwindPreview
                          rows={rows}
                          currencySymbol="€"
                          display={display}
                          previewDevice={previewDevice}
                          freezeCountdown
                        />
                      </Box>
                    </div>
                  </Box>
                </BlockStack>
              </InlineGrid>
              </Box>
            </div>
          </Card>

          {footnote}
        </BlockStack>
        </div>
      </Modal.Section>
    </Modal>
  );
}

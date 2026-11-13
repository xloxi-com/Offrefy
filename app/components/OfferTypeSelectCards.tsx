import type { ReactNode } from "react";
import { Card, Divider, InlineStack, Text } from "@shopify/polaris";
import { Button } from "./AppButton";

import { PlanUpgradeBadge } from "./PlanUpgradeBadge";
import { BogoOfferTypeThumb } from "./BogoOfferTypeThumb";
import styles from "./OfferTypeSelectCards.module.css";
import { useAdminI18n } from "./AdminI18nProvider";

export type OfferTypeCardFooterProps = {
  title: string;
  onCreate: () => void;
  /** Plan offer cap — disable Create and show Upgrade badge. */
  createLocked?: boolean;
};

const QB_PREVIEW_SRC = "/offer-type-quantity-breaks.jpg";
const VD_PREVIEW_SRC = "/offer-type-volume-discount.jpg";

function OfferTypeCardFooter({
  title,
  onCreate,
  createLocked = false,
}: OfferTypeCardFooterProps) {
  const { t } = useAdminI18n();
  return (
    <div className={styles.cardFooter}>
      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <Button
            variant="primary"
            disabled={createLocked}
            onClick={onCreate}
          >
            {t("common.create")}
          </Button>
          {createLocked ? <PlanUpgradeBadge /> : null}
        </InlineStack>
      </InlineStack>
    </div>
  );
}

function OfferTypeSelectCardShell({
  title,
  onCreate,
  createLocked = false,
  children,
}: OfferTypeCardFooterProps & {
  children: ReactNode;
}) {
  return (
    <div className={styles.gridCell}>
      <div className={styles.cardFill}>
        <Card roundedAbove="sm">
          <div className={styles.cardColumn}>
            <div className={styles.cardBody}>
              <div className={styles.previewImageFrame}>{children}</div>
            </div>

            <Divider />

            <OfferTypeCardFooter
              title={title}
              onCreate={onCreate}
              createLocked={createLocked}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StaticOfferTypePreview({ src }: { src: string }) {
  return (
    <img
      className={styles.previewImage}
      src={src}
      alt=""
      width={440}
      height={360}
      decoding="async"
      loading="eager"
      fetchPriority="high"
    />
  );
}

export type QuantityBreaksSelectCardProps = OfferTypeCardFooterProps;

export function QuantityBreaksSelectCard(props: QuantityBreaksSelectCardProps) {
  return (
    <OfferTypeSelectCardShell {...props}>
      <StaticOfferTypePreview src={QB_PREVIEW_SRC} />
    </OfferTypeSelectCardShell>
  );
}

export function VolumeDiscountComingSoonCard(props: OfferTypeCardFooterProps) {
  return (
    <OfferTypeSelectCardShell {...props}>
      <StaticOfferTypePreview src={VD_PREVIEW_SRC} />
    </OfferTypeSelectCardShell>
  );
}

export function BogoSelectCard(props: OfferTypeCardFooterProps) {
  return (
    <OfferTypeSelectCardShell {...props}>
      <BogoOfferTypeThumb fit />
    </OfferTypeSelectCardShell>
  );
}

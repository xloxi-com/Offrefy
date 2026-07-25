import {
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Text,
} from "@shopify/polaris";

import { PlanUpgradeBadge } from "./PlanUpgradeBadge";
import styles from "./OfferTypeSelectCards.module.css";
import { useAdminI18n } from "./AdminI18nProvider";

export type OfferTypeCardFooterProps = {
  title: string;
  onPreview: () => void;
  onLearnMore: () => void;
  onCreate: () => void;
  /** Plan offer cap — disable Create and show Upgrade badge. */
  createLocked?: boolean;
};

function OfferTypeCardFooter({
  title,
  onPreview,
  onLearnMore,
  onCreate,
  createLocked = false,
}: OfferTypeCardFooterProps) {
  const { t } = useAdminI18n();
  return (
    <div className={styles.cardFooter}>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <InlineStack gap="100" wrap>
            <Button variant="tertiary" onClick={onPreview}>
              {t("common.preview")}
            </Button>
            <Button variant="tertiary" onClick={onLearnMore}>
              {t("common.learnMore")}
            </Button>
          </InlineStack>
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
      </BlockStack>
    </div>
  );
}

const QB_PREVIEW_SRC = "/offer-type-quantity-breaks.jpg";
const VD_PREVIEW_SRC = "/offer-type-volume-discount.jpg";

export type QuantityBreaksSelectCardProps = OfferTypeCardFooterProps;

export function QuantityBreaksSelectCard({
  title,
  onPreview,
  onLearnMore,
  onCreate,
  createLocked = false,
}: QuantityBreaksSelectCardProps) {
  return (
    <div className={styles.gridCell}>
      <div className={styles.cardFill}>
        <Card roundedAbove="sm">
          <div className={styles.cardColumn}>
            <div className={styles.cardBody}>
              <div className={styles.previewImageFrame}>
                <img
                  className={styles.previewImage}
                  src={QB_PREVIEW_SRC}
                  alt=""
                  decoding="async"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </div>

            <Divider />

            <OfferTypeCardFooter
              title={title}
              onPreview={onPreview}
              onLearnMore={onLearnMore}
              onCreate={onCreate}
              createLocked={createLocked}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function VolumeDiscountComingSoonCard(props: OfferTypeCardFooterProps) {
  const { title, onPreview, onLearnMore, onCreate, createLocked = false } =
    props;

  return (
    <div className={styles.gridCell}>
      <div className={styles.cardFill}>
        <Card roundedAbove="sm">
          <div className={styles.cardColumn}>
            <div className={styles.cardBody}>
              <div className={styles.previewImageFrame}>
                <img
                  className={styles.previewImage}
                  src={VD_PREVIEW_SRC}
                  alt=""
                  decoding="async"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </div>

            <Divider />

            <OfferTypeCardFooter
              title={title}
              onPreview={onPreview}
              onLearnMore={onLearnMore}
              onCreate={onCreate}
              createLocked={createLocked}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

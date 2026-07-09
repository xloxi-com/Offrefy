import {
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Text,
} from "@shopify/polaris";

import styles from "./OfferTypeSelectCards.module.css";

export type OfferTypeCardFooterProps = {
  title: string;
  onPreview: () => void;
  onLearnMore: () => void;
  onCreate: () => void;
};

function OfferTypeCardFooter({
  title,
  onPreview,
  onLearnMore,
  onCreate,
}: OfferTypeCardFooterProps) {
  return (
    <div className={styles.cardFooter}>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <InlineStack gap="100" wrap>
            <Button variant="tertiary" onClick={onPreview}>
              Preview
            </Button>
            <Button variant="tertiary" onClick={onLearnMore}>
              Learn more
            </Button>
          </InlineStack>
          <Button variant="primary" onClick={onCreate}>
            Create
          </Button>
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
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function VolumeDiscountComingSoonCard(props: OfferTypeCardFooterProps) {
  const { title, onPreview, onLearnMore, onCreate } = props;

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
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

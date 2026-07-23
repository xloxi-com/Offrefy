import { Modal, Text } from "@shopify/polaris";
import { useLocation, useNavigate } from "react-router";

import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { useAdminI18n } from "./AdminI18nProvider";

type OfferLimitUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  message: string;
};

/** Plan-cap gate: explain the limit and send merchants to Pricing. */
export function OfferLimitUpgradeModal({
  open,
  onClose,
  message,
}: OfferLimitUpgradeModalProps) {
  const { t } = useAdminI18n();
  const navigate = useNavigate();
  const { search } = useLocation();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("common.upgradeToUnlock")}
      primaryAction={{
        content: t("common.upgradePlan"),
        onAction: () => {
          onClose();
          navigate(pricingHref);
        },
      }}
      secondaryActions={[
        {
          content: t("common.close"),
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <Text as="p">{message}</Text>
      </Modal.Section>
    </Modal>
  );
}

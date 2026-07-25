import { Badge } from "@shopify/polaris";

import { useAdminI18n } from "./AdminI18nProvider";

/** Compact Polaris badge for plan-locked actions (bulk menus, buttons, etc.). */
export function PlanUpgradeBadge() {
  const { t } = useAdminI18n();
  return <Badge tone="info">{t("common.upgradePlan")}</Badge>;
}

/** Page / menu action label with upgrade hint when the feature is locked. */
export function planLockedActionContent(
  label: string,
  locked: boolean,
  upgradeLabel: string,
): string {
  return locked ? `${label} · ${upgradeLabel}` : label;
}

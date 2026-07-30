import { useLocation, useNavigate } from "react-router";
import type { SyntheticEvent } from "react";

import { adminEmbeddedPath } from "../utils/adminEmbeddedPath";
import { isAppearancePresetAllowedForTier } from "../utils/appearanceTemplateAccess";
import type { AppearanceTemplatesTier } from "../utils/pricingPlans";
import {
  applyVolumeDiscountAppearancePreset,
  applyVolumeTableAppearancePreset,
  type VolumeDiscountAppearancePresetRow,
  type VolumeDiscountWidgetDisplay,
} from "../utils/widgetDisplay";
import createStyles from "../styles/volume-discount-create.module.css";
import { useAdminI18n } from "./AdminI18nProvider";
import { PlanUpgradeBadge } from "./PlanUpgradeBadge";

type AppearanceTemplateGridProps = {
  presets: VolumeDiscountAppearancePresetRow[];
  widgetDisplay: VolumeDiscountWidgetDisplay;
  setWidgetDisplay: (next: VolumeDiscountWidgetDisplay) => void;
  patchWidgetDisplay: (patch: Partial<VolumeDiscountWidgetDisplay>) => void;
  appearanceTemplates: AppearanceTemplatesTier;
  /** Volume table presets use a separate apply helper. */
  forVolumeTable: boolean;
  ariaLabel: string;
};

function applyPreset(
  forVolumeTable: boolean,
  widgetDisplay: VolumeDiscountWidgetDisplay,
  presetId: VolumeDiscountAppearancePresetRow["id"],
): VolumeDiscountWidgetDisplay {
  return forVolumeTable
    ? applyVolumeTableAppearancePreset(widgetDisplay, presetId)
    : applyVolumeDiscountAppearancePreset(widgetDisplay, presetId);
}

function stopCardSelect(e: SyntheticEvent) {
  e.stopPropagation();
}

export function AppearanceTemplateGrid({
  presets,
  widgetDisplay,
  setWidgetDisplay,
  patchWidgetDisplay,
  appearanceTemplates,
  forVolumeTable,
  ariaLabel,
}: AppearanceTemplateGridProps) {
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const navigate = useNavigate();
  const pricingHref = adminEmbeddedPath("/app/pricing", search);

  return (
    <div className={createStyles.appearanceTemplateGrid} aria-label={ariaLabel}>
      {presets.map((preset) => {
        const selected = widgetDisplay.appearanceTemplateId === preset.id;
        const locked = !isAppearancePresetAllowedForTier(
          appearanceTemplates,
          preset.id,
        );
        const className = [
          createStyles.appearanceTemplateCard,
          selected ? createStyles.appearanceTemplateCardSelected : "",
          locked ? createStyles.appearanceTemplateCardLocked : "",
        ]
          .filter(Boolean)
          .join(" ");

        const selectPreset = () => {
          setWidgetDisplay(
            applyPreset(forVolumeTable, widgetDisplay, preset.id),
          );
        };

        return (
          <div
            key={preset.id}
            role="button"
            tabIndex={0}
            className={className}
            title={
              locked
                ? t("offerEditor.appearance.templatePreviewLockedTitle")
                : undefined
            }
            onClick={selectPreset}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectPreset();
              }
            }}
          >
            <span
              className={createStyles.appearanceTemplateSwatch}
              style={
                preset.swatchImage
                  ? {
                      backgroundImage: `url(${preset.swatchImage})`,
                      backgroundSize: preset.swatchImage.endsWith(".svg")
                        ? "70%"
                        : "cover",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      backgroundColor: "#fff",
                    }
                  : { backgroundColor: preset.swatch }
              }
              aria-hidden
            />
            <span className={createStyles.appearanceTemplateLabel}>
              {preset.label}
            </span>
            {locked ? (
              <button
                type="button"
                className={createStyles.appearanceTemplateLockBadge}
                title={t("common.upgradePlan")}
                aria-label={t("common.upgradePlan")}
                onMouseDown={stopCardSelect}
                onPointerDown={stopCardSelect}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(pricingHref);
                }}
              >
                <PlanUpgradeBadge />
              </button>
            ) : null}
          </div>
        );
      })}
      <div
        role="button"
        tabIndex={0}
        className={
          widgetDisplay.appearanceTemplateId === "custom"
            ? `${createStyles.appearanceTemplateCard} ${createStyles.appearanceTemplateCardSelected}`
            : createStyles.appearanceTemplateCard
        }
        onClick={() =>
          patchWidgetDisplay({
            appearanceTemplateId: "custom",
            appearanceDecorThemeId: "",
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            patchWidgetDisplay({
              appearanceTemplateId: "custom",
              appearanceDecorThemeId: "",
            });
          }
        }}
      >
        <span
          className={createStyles.appearanceTemplateSwatchCustom}
          aria-hidden
        />
        <span className={createStyles.appearanceTemplateLabel}>
          {t("offerEditor.appearance.custom")}
        </span>
      </div>
    </div>
  );
}

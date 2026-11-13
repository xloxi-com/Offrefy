import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { QuantityBreaksTailwindPreview } from "./QuantityBreaksTailwindPreview";
import {
  getOfferTypePreviewRows,
  getOfferTypePreviewWidgetDisplay,
} from "../utils/offerTypeSelectPreviewRows";
import styles from "./OfferTypeWidgetThumb.module.css";

export type OfferTypeWidgetThumbPreset = "quantity" | "volume";

/** Stable design width — measure once, then contain-scale (no reflow / no crop). */
const CANVAS_WIDTH = 340;
const STAGE_INSET = 8;

/**
 * Live quantity / volume widget for Select offer type cards.
 * Scales uniformly to fit the shared frame (full widget visible, no crop).
 */
export function OfferTypeWidgetThumb({
  preset,
}: {
  preset: OfferTypeWidgetThumbPreset;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const rows = useMemo(() => getOfferTypePreviewRows(preset), [preset]);
  const display = useMemo(
    () => getOfferTypePreviewWidgetDisplay(preset),
    [preset],
  );

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const measure = () => {
      const root =
        canvas.querySelector<HTMLElement>(".vd-admin-qb-preview") ?? canvas;
      const naturalH = Math.max(root.scrollHeight, root.offsetHeight, 1);
      const sw = Math.max(stage.clientWidth - STAGE_INSET * 2, 1);
      const sh = Math.max(stage.clientHeight - STAGE_INSET * 2, 1);
      // Classic object-fit: contain — never crop.
      const next = Math.min(sw / CANVAS_WIDTH, sh / naturalH);
      setScale(Math.max(0.22, next));
    };

    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(stage);
    ro.observe(canvas);
    const root = canvas.querySelector(".vd-admin-qb-preview");
    if (root) ro.observe(root);
    const timers = [50, 150, 350, 700].map((ms) => window.setTimeout(measure, ms));
    return () => {
      ro.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [preset, display, rows]);

  return (
    <div ref={stageRef} className={styles.stage}>
      <div
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: CANVAS_WIDTH,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <QuantityBreaksTailwindPreview
          rows={rows}
          currencySymbol="€"
          display={display}
          previewDevice="desktop"
          freezeCountdown
        />
      </div>
    </div>
  );
}

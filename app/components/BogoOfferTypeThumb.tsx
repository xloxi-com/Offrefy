import { useLayoutEffect, useRef, useState } from "react";
import {
  BogoSpecialOfferCard,
  type BogoGiftOption,
} from "./BogoSpecialOfferCard";
import {
  bogoPanelColorStyle,
  DEFAULT_BOGO_WIDGET_COPY,
} from "../utils/bogoWidgetCopy";
import styles from "./BogoOfferTypeThumb.module.css";

function bottleImage(body: string, label: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">` +
    `<rect width="80" height="120" fill="#f7f7f8"/>` +
    `<path d="M32 8h16v14c6 4 10 10 10 18v62c0 6-4 10-10 10H32c-6 0-10-4-10-10V40c0-8 4-14 10-18V8z" fill="${body}"/>` +
    `<rect x="30" y="6" width="20" height="8" rx="2" fill="#3a3a3a"/>` +
    `<rect x="24" y="58" width="32" height="22" rx="3" fill="${label}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const BUY_IMAGE = bottleImage("#1a1a1a", "#f5a623");
const GET_IMAGE = bottleImage("#c81e1e", "#fff");

const SAMPLE_GIFT: BogoGiftOption = {
  id: "classic",
  name: "Coca-Cola Original",
  tone: "classic",
  image: GET_IMAGE,
};

const COPY = DEFAULT_BOGO_WIDGET_COPY;

/**
 * Desktop product-column width — must stay above storefront @container
 * stack breakpoints (400px / 360px) so Buy | + | Get stays side-by-side.
 */
const CANVAS_WIDTH = 560;
const STAGE_INSET = 8;

/** Force desktop equation layout inside the shadow DOM (beats @container). */
const DESKTOP_LAYOUT_CSS = `
.offrefy-bogo .offrefy-bogo__equation {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr) !important;
  align-items: stretch !important;
  gap: 8px !important;
}
.offrefy-bogo .offrefy-bogo__op {
  display: inline-flex !important;
  align-self: center !important;
  justify-self: center !important;
}
.offrefy-bogo .offrefy-bogo__tile--buy,
.offrefy-bogo .offrefy-bogo__tile--get {
  min-width: 0 !important;
  width: 100% !important;
}
.offrefy-bogo .offrefy-bogo__hero {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
}
.offrefy-bogo .offrefy-bogo__hero-copy {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 8px !important;
}
`;

export type BogoOfferTypeThumbProps = {
  /** When true, scales the full widget into the parent (select-type card). */
  fit?: boolean;
};

/**
 * Live storefront-matching BOGO card for Select offer type + Preview modal.
 * Shows full Buy X Get Y UI: hero, Buy tile, Get Free tile, Add to cart.
 */
export function BogoOfferTypeThumb({ fit = false }: BogoOfferTypeThumbProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!fit) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const measure = () => {
      const host = canvas.querySelector("div");
      const card =
        host?.shadowRoot?.querySelector<HTMLElement>(".offrefy-bogo") ??
        host?.shadowRoot?.querySelector<HTMLElement>("[data-offrefy-bogo-root]") ??
        null;
      const naturalH = Math.max(
        card?.scrollHeight ?? 0,
        card?.offsetHeight ?? 0,
        canvas.scrollHeight,
        1,
      );
      const sw = Math.max(stage.clientWidth - STAGE_INSET * 2, 1);
      const sh = Math.max(stage.clientHeight - STAGE_INSET * 2, 1);
      const next = Math.min(sw / CANVAS_WIDTH, sh / naturalH);
      setScale(Math.max(0.28, next));
    };

    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(stage);
    ro.observe(canvas);
    const host = canvas.querySelector("div");
    if (host) ro.observe(host);
    const timers = [80, 200, 450, 900].map((ms) => window.setTimeout(measure, ms));
    return () => {
      ro.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [fit]);

  const card = (
    <BogoSpecialOfferCard
      heading="Buy 5, get 1 free"
      badgeLabel={COPY.badgeLabel}
      buyLabel={COPY.buyLabel}
      getLabel={COPY.getFreeLabel}
      subtitle="Buy Boga Pack de 6 × 1.5L and get a Coca-Cola of your choice for free."
      buyImage={BUY_IMAGE}
      buyName="Boga Pack de 6 × 1.5L"
      buyPrice="$2.80"
      buyQty={5}
      gifts={[SAMPLE_GIFT]}
      pickLabel="Coca-Cola Original"
      rewardLabel={COPY.freeLabel}
      ctaLabel="Add to cart"
      buttonColor="#111111"
      panelStyle={bogoPanelColorStyle(COPY, "#111111")}
      customCss={DESKTOP_LAYOUT_CSS}
    />
  );

  if (!fit) {
    return <div className={styles.plain}>{card}</div>;
  }

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
        {card}
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";

export type BogoGiftTone = "classic" | "zero" | "light" | "generic";

export type BogoGiftOption = {
  id: string;
  name: string;
  tone: BogoGiftTone;
  image?: string;
};

export type BogoSpecialOfferCardProps = {
  heading: string;
  badgeLabel?: string;
  buyLabel?: string;
  getLabel?: string;
  subtitle: string;
  buyImage?: string;
  buyName: string;
  buyPrice: string;
  buyQty?: number;
  gifts: BogoGiftOption[];
  pickLabel: string;
  availableLabel?: string;
  rewardLabel: string;
  ctaLabel: string;
  limitLabel?: string;
  buttonColor?: string;
  panelStyle?: string;
  customCss?: string;
};

const PREVIEW_CSS = "/vd-storefront.css?v=1.31.84";

const CART =
  '<svg class="offrefy-bogo__ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="m1 1c-.55228475 0-1 .44771525-1 1s.44771525 1 1 1h1.7792969a.69367162.69367162 35.784145 0 1 .65808707.47435058l3.2969911 9.8928369c.14641172.43923517.16502704.91215746.05273437 1.3613281l-.27148437 1.0878906c-.39834445 1.5933778.84195876 3.1835938 2.484375 3.1835938h12c.55228475 0 1-.44771525 1-1s-.44771525-1-1-1h-12c-.38938619 0-.6393619-.31950554-.54492188-.69726562l.20473297-.81770594a.64062109.64062109 142.02823 0 1 .6214389-.48502844h10.71875c.43057012.00022511.81295428-.27515444.94921875-.68359375l2.6660156-8c.21596464-.64778704-.26638007-1.3167178-.94921876-1.3164062h-16.111328a.69371294.69371294 35.782526 0 1 -.65811388-.47434165l-.94735487-2.8420646c-.13626447-.40843931-.51864863-.68381886-.94921875-.68359375zm7 19c-1.1045695 0-2 .8954305-2 2s.8954305 2 2 2 2-.8954305 2-2-.8954305-2-2-2zm12 0c-1.1045695 0-2 .8954305-2 2s.8954305 2 2 2 2-.8954305 2-2-.8954305-2-2-2z"/></svg>';
const GIFT =
  '<svg class="offrefy-bogo__ico" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M32 271.692v192c0 17.664 14.368 32 32 32h160v-224H32z"/><path fill="currentColor" d="M480 143.692H378.752c7.264-4.96 13.504-9.888 17.856-14.304 25.824-25.952 25.824-68.192 0-94.144-25.088-25.28-68.8-25.216-93.856 0-13.888 13.92-50.688 70.592-45.6 108.448h-2.304c5.056-37.856-31.744-94.528-45.6-108.448-25.088-25.216-68.8-25.216-93.856 0C89.6 61.196 89.6 103.436 115.36 129.388c4.384 4.416 10.624 9.344 17.888 14.304H32c-17.632 0-32 14.368-32 32v48c0 8.832 7.168 16 16 16h208v-64h64v64h208c8.832 0 16-7.168 16-16v-48c0-17.632-14.336-32-32-32zM222.112 142.636s-1.344 1.056-5.92 1.056c-22.112 0-64.32-22.976-78.112-36.864-13.408-13.504-13.408-35.52 0-49.024 6.496-6.528 15.104-10.112 24.256-10.112 9.12 0 17.728 3.584 24.224 10.112 21.568 21.696 43.008 77.12 35.552 84.832zM295.776 143.692c-4.544 0-5.888-1.024-5.888-1.056-7.456-7.712 13.984-63.136 35.552-84.832 12.896-13.024 35.456-13.088 48.48 0 13.44 13.504 13.44 35.52 0 49.024-13.792 13.888-56 36.864-78.144 36.864z"/><path fill="currentColor" d="M288 271.692v224h160c17.664 0 32-14.336 32-32v-192H288z"/></svg>';
const EQUALS =
  '<svg class="offrefy-bogo__op-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11 4.5h2a.5.5 0 0 1 .5.5v5.5H19a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-5.5V19a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-5.5H5a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h5.5V5a.5.5 0 0 1 .5-.5z"/></svg>';
const CHECK =
  '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 12L10.5 15L16.5 9M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function previewImg(src: string | undefined, alt: string) {
  if (!src) {
    return `<div class="offrefy-bogo__img offrefy-bogo__img--ph" aria-hidden="true"></div>`;
  }
  return `<img class="offrefy-bogo__img" src="${esc(src)}" alt="${esc(alt)}" />`;
}

function cardMarkup(props: BogoSpecialOfferCardProps) {
  const gifts = props.gifts;
  const multi = gifts.length > 1;
  const carousel = gifts.length > 2;
  const nav =
    carousel
      ? `<div class="offrefy-bogo__navs">` +
        `<button type="button" class="offrefy-bogo__picker-nav" data-offrefy-bogo-gift-prev aria-label="Previous gifts"><svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M12.7 15.3 7.4 10l5.3-5.3 1.1 1.1L9.6 10l4.2 4.2z"/></svg></button>` +
        `<button type="button" class="offrefy-bogo__picker-nav" data-offrefy-bogo-gift-next aria-label="Next gifts"><svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M7.3 4.7 12.6 10l-5.3 5.3-1.1-1.1L10.4 10 6.2 5.8z"/></svg></button>` +
        `</div>`
      : "";
  const choiceCards = gifts
    .map(
      (gift, index) =>
        `<button type="button" class="offrefy-bogo__choice${index === 0 ? " is-selected" : ""}" data-offrefy-bogo-gift-idx="${index}" aria-pressed="${index === 0 ? "true" : "false"}">` +
        `<span class="offrefy-bogo__choice-card">` +
        `<span class="offrefy-bogo__check" aria-hidden="true">${CHECK}</span>` +
        previewImg(gift.image, gift.name) +
        `<span class="offrefy-bogo__choice-name">${esc(gift.name)}</span></span></button>`,
    )
    .join("");
  const choices = multi
    ? `<div class="offrefy-bogo__slider">` +
      (carousel ? `<div class="offrefy-bogo__viewport">` : "") +
      `<div class="offrefy-bogo__choices" style="--ob-choices:${carousel ? 2 : gifts.length}" role="listbox">` +
      choiceCards +
      `</div>` +
      (carousel ? `</div>` : "") +
      `</div>`
    : `<div class="offrefy-bogo__media">${previewImg(gifts[0]?.image, gifts[0]?.name || "")}</div>`;
  const qty =
    (props.buyQty || 1) > 1
      ? `<span class="offrefy-bogo__qty">×${props.buyQty}</span>`
      : "";
  const hint = props.availableLabel
    ? `<div class="offrefy-bogo__hint">${esc(props.availableLabel)}</div>`
    : "";
  const limit = props.limitLabel
    ? `<div class="offrefy-bogo__limit">${esc(props.limitLabel)}</div>`
    : "";

  const css = String(props.customCss || "")
    .replace(/<\/style/gi, "")
    .trim();
  const style = [props.panelStyle || "", props.buttonColor ? `--ob-cta:${props.buttonColor}` : ""]
    .filter(Boolean)
    .join(";");
  return (
    (css ? `<style data-offrefy-bogo-custom-css>${css}</style>` : "") +
    `<div class="offrefy-bogo"${style ? ` style="${esc(style)}"` : ""}>` +
    `<div class="offrefy-bogo__hero">` +
    `<div class="offrefy-bogo__hero-copy">` +
    `<div class="offrefy-bogo__title">${esc(props.heading && !/^special offer$/i.test(props.heading) ? props.heading : "Buy X, get Y free")}</div>` +
    `<div class="offrefy-bogo__badge">` +
    `<span class="offrefy-bogo__hero-icon" aria-hidden="true">${GIFT}</span>` +
    `<span>${esc(props.badgeLabel || "Special Offer")}</span></div></div>` +
    `<p class="offrefy-bogo__sub">${esc(props.subtitle)}</p></div>` +
    `<div class="offrefy-bogo__equation">` +
    `<div class="offrefy-bogo__tile offrefy-bogo__tile--buy">` +
    `<div class="offrefy-bogo__head"><div class="offrefy-bogo__ribbon offrefy-bogo__ribbon--buy">${CART}<span>${esc(props.buyLabel || "BUY")}</span></div></div>` +
    `<div class="offrefy-bogo__media">${previewImg(props.buyImage, props.buyName)}</div>` +
    `<div class="offrefy-bogo__name">${esc(props.buyName)}</div>` +
    `<div class="offrefy-bogo__buy-meta"><div class="offrefy-bogo__price offrefy-bogo__price--buy">${esc(props.buyPrice)}</div>${qty}</div></div>` +
    `<span class="offrefy-bogo__op" aria-hidden="true">${EQUALS}</span>` +
    `<div class="offrefy-bogo__tile offrefy-bogo__tile--get offrefy-bogo__tile--free${multi ? " offrefy-bogo__tile--multi" : ""}">` +
    `<div class="offrefy-bogo__head"><div class="offrefy-bogo__ribbon offrefy-bogo__ribbon--get">${GIFT}<span>${esc(props.getLabel || "GET FREE")}</span></div>${nav}</div>` +
    choices +
    `<div class="offrefy-bogo__foot"><div class="offrefy-bogo__foot-copy">` +
    `<div class="offrefy-bogo__name">${multi ? GIFT : ""}<span>${esc(props.pickLabel)}</span></div>` +
    hint +
    `</div><div class="offrefy-bogo__price offrefy-bogo__price--free"><span class="offrefy-bogo__price-now">${esc(props.rewardLabel)}</span></div></div></div></div>` +
    limit +
    `<div class="offrefy-bogo__cta-row"><button type="button" class="offrefy-bogo__cta"><span class="offrefy-bogo__cta-label">${esc(props.ctaLabel)}</span></button></div>` +
    `</div>`
  );
}

export function BogoSpecialOfferCard(props: BogoSpecialOfferCardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const signature = [
    props.heading,
    props.badgeLabel,
    props.buyLabel,
    props.getLabel,
    props.subtitle,
    props.buyName,
    props.buyPrice,
    props.buyQty,
    props.pickLabel,
    props.availableLabel,
    props.rewardLabel,
    props.ctaLabel,
    props.limitLabel,
    props.panelStyle,
    props.customCss,
    props.buttonColor,
    props.buyImage,
    props.gifts.map((gift) => gift.id + gift.name + (gift.image || "")).join("|"),
  ].join("\n");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let link = shadow.querySelector<HTMLLinkElement>("link[data-offrefy-bogo-css]");
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-offrefy-bogo-css", "1");
      shadow.appendChild(link);
    }
    if (link.href !== new URL(PREVIEW_CSS, window.location.origin).href) {
      link.href = PREVIEW_CSS;
    }
    let scope = shadow.querySelector<HTMLElement>("[data-offrefy-bogo-root]");
    if (!scope) {
      scope = document.createElement("div");
      scope.setAttribute("data-offrefy-bogo-root", "1");
      scope.setAttribute("data-offrefy-root", "");
      scope.className = "offrefy-bogo-host";
      shadow.appendChild(scope);
    }
    scope.innerHTML = cardMarkup(propsRef.current);
    const scroller = scope.querySelector<HTMLElement>(".offrefy-bogo__choices");
    let dragged = false;
    let drag: { id: number; x: number; left: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (!scroller || event.pointerType !== "mouse" || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, left: scroller.scrollLeft };
      dragged = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!scroller || !drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      if (!dragged && Math.abs(dx) < 6) return;
      dragged = true;
      scroller.classList.add("is-dragging");
      scroller.scrollLeft = drag.left - dx;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      scroller?.classList.remove("is-dragging");
    };
    const onClick = (event: Event) => {
      if (dragged) {
        dragged = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || !scope) return;
      const choice = target.closest("[data-offrefy-bogo-gift-idx]");
      if (choice) {
        const index = choice.getAttribute("data-offrefy-bogo-gift-idx");
        scope.querySelectorAll("[data-offrefy-bogo-gift-idx]").forEach((node) => {
          const selected = node.getAttribute("data-offrefy-bogo-gift-idx") === index;
          node.classList.toggle("is-selected", selected);
          node.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        return;
      }
      const scrollerEl = scope.querySelector<HTMLElement>(".offrefy-bogo__choices");
      const arrow = target.closest("[data-offrefy-bogo-gift-prev], [data-offrefy-bogo-gift-next]");
      if (!scrollerEl || !arrow) return;
      const card = scrollerEl.querySelector<HTMLElement>(".offrefy-bogo__choice");
      const step = (card?.getBoundingClientRect().width || scrollerEl.clientWidth / 3) + 8;
      const dir = arrow.hasAttribute("data-offrefy-bogo-gift-next") ? 1 : -1;
      scrollerEl.scrollTo({ left: scrollerEl.scrollLeft + dir * step, behavior: "smooth" });
    };
    scroller?.addEventListener("pointerdown", onPointerDown);
    scroller?.addEventListener("pointermove", onPointerMove);
    scroller?.addEventListener("pointerup", onPointerUp);
    scroller?.addEventListener("pointercancel", onPointerUp);
    scope.addEventListener("click", onClick);
    return () => {
      scroller?.removeEventListener("pointerdown", onPointerDown);
      scroller?.removeEventListener("pointermove", onPointerMove);
      scroller?.removeEventListener("pointerup", onPointerUp);
      scroller?.removeEventListener("pointercancel", onPointerUp);
      scope?.removeEventListener("click", onClick);
    };
  }, [signature]);

  return (
    <div
      ref={hostRef}
      style={{ display: "block", width: "100%", minWidth: 0 }}
    />
  );
}

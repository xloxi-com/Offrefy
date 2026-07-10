"use strict";
(function () {
  "use strict";
  var PROXY = "/apps/volume-discount/widget-config";
  /** @type {Map<string, Promise<object>>} */
  var fetchPromiseByKey = new Map();
  /** Per-product dedupe: variant id rarely changes widget tiers for the same product. */
  /** @type {Map<string, Promise<object>>} */
  var fetchPromiseByProductId = new Map();
  /** Upper bound for widget qty + /cart/add.js line quantity (Shopify allows large lines; caps abuse). */
  var VD_MAX_LINE_QTY = 9999;

  function fetchConfigKey(productId, variantId) {
    return String(productId || "") + "|" + String(variantId || "");
  }

  function fetchConfig(productId, variantId) {
    var pid = String(productId || "");
    if (pid) {
      var byProduct = fetchPromiseByProductId.get(pid);
      if (byProduct) return byProduct;
    }
    var key = fetchConfigKey(productId, variantId);
    var existing = fetchPromiseByKey.get(key);
    if (existing) return existing;
    var url = PROXY;
    if (productId) {
      url +=
        "?product_id=" +
        encodeURIComponent(String(productId)) +
        (variantId
          ? "&variant_id=" + encodeURIComponent(String(variantId))
          : "");
    }
    var shopDomain = window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";
    if (shopDomain) {
      url += (url.indexOf("?") === -1 ? "?" : "&") + "shop=" + encodeURIComponent(shopDomain);
    }
    var promise = fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res || !res.ok) {
          fetchPromiseByKey.delete(key);
          if (pid) fetchPromiseByProductId.delete(pid);
          return { version: 1, campaigns: [] };
        }
        return res.json();
      })
      .catch(function () {
        fetchPromiseByKey.delete(key);
        if (pid) fetchPromiseByProductId.delete(pid);
        return { version: 1, campaigns: [] };
      });
    fetchPromiseByKey.set(key, promise);
    if (pid) fetchPromiseByProductId.set(pid, promise);
    return promise;
  }

  function parseInline(el) {
    if (!el || !el.textContent) return { version: 1, campaigns: [] };
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return { version: 1, campaigns: [] };
    }
  }

  /**
   * Theme editor demo JSON uses campaign id `_preview`. On the live storefront that
   * must never render (stale shop metafield or cached app-proxy payload). Design mode
   * keeps preview tiers for the theme editor.
   */
  function sanitizeWidgetConfig(cfg, designMode) {
    if (!cfg || typeof cfg !== "object") return { version: 1, campaigns: [] };
    var list = Array.isArray(cfg.campaigns) ? cfg.campaigns : [];
    if (designMode) return { version: cfg.version || 1, campaigns: list };
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || typeof c !== "object") continue;
      if (String(c.id || "") === "_preview") continue;
      out.push(c);
    }
    return { version: cfg.version || 1, campaigns: out };
  }

  function productMatch(campaign, productId, variantId, productGid, variantGid) {
    if (campaign.productScope === "all") return true;
    var p = String(productId || "");
    var v = String(variantId || "");
    var og = productGid ? String(productGid) : "";
    var vg = variantGid ? String(variantGid) : "";
    var ids = campaign.productIds || [];
    for (var i = 0; i < ids.length; i++) {
      var s = String(ids[i]);
      if (og && s === og) return true;
      if (vg && s === vg) return true;
      if (p && s === p) return true;
      if (v && s === v) return true;
      if (s.indexOf("/Product/" + p) !== -1) return true;
      if (s.indexOf("/Variant/" + v) !== -1) return true;
    }
    return false;
  }

  function pickCampaign(cfg, productId, variantId, productGid, variantGid) {
    var list = (cfg && cfg.campaigns) || [];
    for (var i = 0; i < list.length; i++) {
      if (productMatch(list[i], productId, variantId, productGid, variantGid)) {
        return list[i];
      }
    }
    return null;
  }

  function tierUnitCents(unitCents, tier) {
    if (tier.percent != null && tier.percent !== undefined) {
      var pct = Math.min(100, Math.max(0, Number(tier.percent)));
      return Math.round(unitCents * (1 - pct / 100));
    }
    if (
      tier.fixedPricePerUnit != null &&
      tier.fixedPricePerUnit !== undefined
    ) {
      return Math.round(Number(tier.fixedPricePerUnit) * 100);
    }
    if (tier.fixedAmount != null && tier.fixedAmount !== undefined) {
      var amt = Math.round(Number(tier.fixedAmount) * 100);
      return tier.appliesToEachItem !== false
        ? Math.max(0, unitCents - amt)
        : unitCents;
    }
    return unitCents;
  }

  function lineTotals(unitCents, tier) {
    var q = Math.max(1, tier.minQty | 0);
    var orig = unitCents * q;
    var u = tierUnitCents(unitCents, tier);
    if (
      tier.fixedPricePerUnit != null &&
      tier.fixedPricePerUnit !== undefined
    ) {
      u = Math.round(Number(tier.fixedPricePerUnit) * 100);
    }
    var disc = u * q;
    return { original: orig, discounted: disc, minQty: q };
  }

  function fmtMoney(cents, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cents / 100);
    } catch (e) {
      return (cents / 100).toFixed(2);
    }
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function formatCountdown(sec, unit) {
    function pad2(n) {
      return (n < 10 ? "0" : "") + n;
    }
    function joinDhms(d, h, m, s) {
      var parts = [];
      if (d > 0) parts.push(d + "d");
      if (h > 0) parts.push(h + "h");
      if (m > 0) parts.push(m + "m");
      parts.push(s + "s");
      return parts.join(" ");
    }
    function splitToDhms(t) {
      var d = Math.floor(t / 86400);
      t -= d * 86400;
      var h = Math.floor(t / 3600);
      t -= h * 3600;
      var m = Math.floor(t / 60);
      var s = t % 60;
      return { d: d, h: h, m: m, s: s };
    }
    var SECONDS_PER_DAY = 86400;
    var u = unit === "hours" || unit === "minutes" ? unit : "days";
    var t = Math.max(0, Math.floor(sec));
    if (u === "minutes" && t < SECONDS_PER_DAY) {
      var hh = Math.floor(t / 3600);
      var r0 = t - hh * 3600;
      var mi = Math.floor(r0 / 60);
      var s2 = r0 % 60;
      if (hh > 0) {
        var pm = [];
        pm.push(hh + "h");
        if (mi > 0) pm.push(pad2(mi) + "m");
        pm.push(pad2(s2) + "s");
        return pm.join(" ");
      }
      if (mi > 0) {
        return mi + "m " + pad2(s2) + "s";
      }
      return pad2(s2) + "s";
    }
    var dh = splitToDhms(t);
    return joinDhms(dh.d, dh.h, dh.m, dh.s);
  }

  function clearCountdown(root) {
    var id = root.getAttribute("data-vd-cd-iv");
    if (id) {
      clearInterval(parseInt(id, 10));
      root.removeAttribute("data-vd-cd-iv");
    }
  }

  function shopifyRoutesRoot() {
    try {
      if (
        typeof window.Shopify !== "undefined" &&
        window.Shopify.routes &&
        typeof window.Shopify.routes.root === "string"
      ) {
        var r = window.Shopify.routes.root;
        return r.slice(-1) === "/" ? r : r + "/";
      }
    } catch (e) {
      void e;
    }
    return "/";
  }

  function cartAddJsUrl() {
    return shopifyRoutesRoot() + "cart/add.js";
  }

  function cartJsUrl() {
    return shopifyRoutesRoot() + "cart.js";
  }

  function checkoutUrlHref() {
    return shopifyRoutesRoot() + "checkout";
  }

  function dispatchCartRefresh(cart) {
    try {
      var detail = { cart: cart };
      document.documentElement.dispatchEvent(
        new CustomEvent("cart:updated", { bubbles: true, detail: detail }),
      );
      document.documentElement.dispatchEvent(
        new CustomEvent("cart:change", { bubbles: true, detail: detail }),
      );
      document.documentElement.dispatchEvent(
        new CustomEvent("cart:refresh", { bubbles: true, detail: detail }),
      );
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: cart }));
    } catch (e) {
      void e;
    }
  }

  function openThemeCartDrawer() {
    try {
      var drawer = document.querySelector("cart-drawer");
      if (drawer) {
        if (typeof drawer.open === "function") {
          drawer.open();
          return true;
        }
        if (typeof drawer.show === "function") {
          drawer.show();
          return true;
        }
        drawer.setAttribute("open", "");
        return true;
      }
    } catch (e) {
      void e;
    }

    var names = [
      "cart:open",
      "cart-drawer:open",
      "dispatch:cart-drawer:open",
      "drawer:open",
    ];
    for (var i = 0; i < names.length; i++) {
      try {
        document.documentElement.dispatchEvent(
          new CustomEvent(names[i], { bubbles: true }),
        );
        window.dispatchEvent(new CustomEvent(names[i]));
      } catch (e2) {
        void e2;
      }
    }

    var toggles = [
      "[data-cart-drawer-toggle]",
      "[data-drawer-toggle=cart]",
      'a[href="#CartDrawer"]',
      ".header__icon--cart",
      "#cart-icon-bubble",
    ];
    for (var t = 0; t < toggles.length; t++) {
      var el = document.querySelector(toggles[t]);
      if (el && typeof el.click === "function") {
        el.click();
        return true;
      }
    }
    return false;
  }

  function fetchCartAndRefresh() {
    return fetch(cartJsUrl(), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        if (cart) dispatchCartRefresh(cart);
        return cart;
      })
      .catch(function () {
        return null;
      });
  }

  function addVariantToCart(variantId, quantity) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) {
      return Promise.reject(new Error("Invalid variant"));
    }
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    return fetch(cartAddJsUrl(), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items: [{ id: id, quantity: qty }] }),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var msg = "Could not add to cart";
          if (body && body.description) msg = String(body.description);
          else if (body && body.message) {
            msg = Array.isArray(body.message)
              ? body.message.join(", ")
              : String(body.message);
          }
          throw new Error(msg);
        }
        return body;
      });
    });
  }

  var vdHidePurchaseUiObserver = null;

  function resolveSafePageHref(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    if (s.charAt(0) === "/" && s.charAt(1) !== "/") return s;
    try {
      var u = new URL(s, window.location.origin);
      if (u.origin === window.location.origin) {
        return u.pathname + u.search + u.hash;
      }
    } catch (e) {
      void e;
    }
    return "";
  }

  /** Shopify /cart/add.js often returns this when requested qty exceeds remaining inventory. */
  var VD_MSG_CART_MAX_QTY =
    "The maximum quantity of this item is already in your cart.";

  function isVdCartMaxQuantityErrorMessage(msg) {
    var s = String(msg || "").toLowerCase();
    return (
      s.indexOf("already in your cart") !== -1 ||
      (s.indexOf("maximum") !== -1 &&
        s.indexOf("quantity") !== -1 &&
        s.indexOf("cart") !== -1)
    );
  }

  function completeAfterCartAdd(ui) {
    var act = String(ui.ctaButtonAction || "add_to_cart_open_drawer");
    if (act === "add_to_cart") {
      return fetchCartAndRefresh();
    }
    if (act === "add_to_cart_open_drawer") {
      return fetchCartAndRefresh().then(function () {
        openThemeCartDrawer();
      });
    }
    if (act === "go_to_checkout") {
      return fetchCartAndRefresh().then(function () {
        window.location.href = checkoutUrlHref();
      });
    }
    if (act === "go_to_page") {
      var href = resolveSafePageHref(ui.ctaButtonPageUrl);
      if (href) {
        return fetchCartAndRefresh().then(function () {
          window.location.href = href;
        });
      }
      return fetchCartAndRefresh();
    }
    return fetchCartAndRefresh().then(function () {
      openThemeCartDrawer();
    });
  }

  function hideThemeNativeAddToCartButtons() {
    if (document.documentElement.getAttribute("data-vd-hide-theme-atc") !== "1") {
      return;
    }
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (form.closest(".vd-storefront-root")) continue;
      var btn =
        form.querySelector('button[name="add"]') ||
        form.querySelector('input[type="submit"][name="add"]') ||
        form.querySelector("button.product-form__submit");
      if (!btn) btn = form.querySelector('button[type="submit"]');
      if (!btn || btn.closest(".vd-storefront-root")) continue;
      btn.style.setProperty("display", "none", "important");
      btn.setAttribute("aria-hidden", "true");
    }
  }

  function hideThemeNativeBuyItNowButtons() {
    if (document.documentElement.getAttribute("data-vd-hide-theme-bin") !== "1") {
      return;
    }
    var selectors = [
      ".shopify-payment-button",
      ".dynamic-checkout__content",
      "[data-shopify='payment-button']",
      "shopify-accelerated-checkout-cart",
    ];
    for (var si = 0; si < selectors.length; si++) {
      var nodes = document.querySelectorAll(selectors[si]);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.closest(".vd-storefront-root")) continue;
        n.style.setProperty("display", "none", "important");
        n.setAttribute("aria-hidden", "true");
      }
    }
  }

  /**
   * Hides theme product-form variant UI so the widget picker is used.
   * Covers: variant id (select/radio name="id"), split options (name^="options"), Dawn variant-selects / variant-radios, .product-form__input rows.
   */
  function hideThemeNativeVariantSelectors() {
    if (document.documentElement.getAttribute("data-vd-hide-theme-variant") !== "1") {
      return;
    }
    var seen =
      typeof WeakSet !== "undefined"
        ? new WeakSet()
        : { _a: [], has: function (el) { return this._a.indexOf(el) !== -1; }, add: function (el) { this._a.push(el); } };

    function hideBlock(el) {
      if (!el || el.closest(".vd-storefront-root")) return;
      if (seen.has(el)) return;
      seen.add(el);
      el.style.setProperty("display", "none", "important");
      el.setAttribute("aria-hidden", "true");
    }

    function blockHasVariantUi(el) {
      if (!el || !el.querySelector) return false;
      if (el.querySelector('select[name="id"]')) return true;
      if (el.querySelector('input[type="radio"][name="id"]')) return true;
      if (el.querySelector('select[name^="options"]')) return true;
      if (el.querySelector('input[type="radio"][name^="options"]')) return true;
      if (el.querySelector('input[type="checkbox"][name^="options"]')) return true;
      if (el.querySelector("input.swatch-input")) return true;
      if (el.querySelector("[data-option-value-id]")) return true;
      if (el.querySelector("[data-option-value]")) return true;
      return false;
    }

    function isQuantityOnlyBlock(el) {
      if (!el) return false;
      var c = (el.className && String(el.className).toLowerCase()) || "";
      if (/\bproduct-form__quantity\b/.test(c)) return true;
      if (/\bproduct-form__input\b/.test(c) && /\bquantity\b/.test(c) && !blockHasVariantUi(el)) return true;
      if (el.querySelector('input[name="quantity"]') && !blockHasVariantUi(el)) return true;
      return false;
    }

    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var fi = 0; fi < forms.length; fi++) {
      var form = forms[fi];
      if (form.closest(".vd-storefront-root")) continue;

      var hosts = form.querySelectorAll("variant-selects, variant-radios");
      for (var hi = 0; hi < hosts.length; hi++) {
        hideBlock(hosts[hi]);
      }

      var rows = form.querySelectorAll(
        "fieldset.product-form__input, fieldset.js.product-form__input, .product-form__input",
      );
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        if (isQuantityOnlyBlock(row)) continue;
        if (!blockHasVariantUi(row)) continue;
        hideBlock(row);
      }

      var optRadios = form.querySelectorAll('input[type="radio"][name^="options"]');
      for (var oi = 0; oi < optRadios.length; oi++) {
        var or = optRadios[oi];
        var ow =
          or.closest("fieldset.product-form__input") ||
          or.closest("fieldset.js") ||
          or.closest(".product-form__input") ||
          or.closest(".variant-picker") ||
          or.closest(".product-form__inputs") ||
          or.parentElement;
        hideBlock(ow);
      }

      var optSelects = form.querySelectorAll('select[name^="options"]');
      for (var osi = 0; osi < optSelects.length; osi++) {
        var os = optSelects[osi];
        var osw =
          os.closest("variant-selects") ||
          os.closest("fieldset.product-form__input") ||
          os.closest(".product-form__input") ||
          os.closest("fieldset") ||
          os.parentElement;
        hideBlock(osw);
      }

      var selects = form.querySelectorAll('select[name="id"]');
      for (var si = 0; si < selects.length; si++) {
        var sel = selects[si];
        var wrap =
          sel.closest("variant-selects") ||
          sel.closest(".product-form__input") ||
          sel.closest(".product-form__variants") ||
          sel.closest(".selector-wrapper") ||
          sel.closest(".select-wrapper") ||
          sel.parentElement;
        hideBlock(wrap);
      }

      var radios = form.querySelectorAll('input[type="radio"][name="id"]');
      for (var rdi = 0; rdi < radios.length; rdi++) {
        var rad = radios[rdi];
        var wrapR =
          rad.closest("variant-radios") ||
          rad.closest("variant-selects") ||
          rad.closest(".product-form__input") ||
          rad.closest("fieldset") ||
          rad.closest(".variant-input-wrap");
        hideBlock(wrapR);
      }
    }

    /* Variant UI rendered outside form[action*="/cart/add"] (some themes / sections) */
    var sectionRoots = document.querySelectorAll(
      ".shopify-section--main-product, [id^='MainProduct'], product-info, .product--main .product__info",
    );
    for (var sr = 0; sr < sectionRoots.length; sr++) {
      var sec = sectionRoots[sr];
      if (!sec || sec.closest(".vd-storefront-root")) continue;

      var extHosts = sec.querySelectorAll("variant-selects, variant-radios");
      for (var xi = 0; xi < extHosts.length; xi++) {
        var xh = extHosts[xi];
        if (xh.closest(".vd-storefront-root")) continue;
        if (xh.closest('form[action*="/cart/add"]')) continue;
        hideBlock(xh);
      }

      var extFieldsets = sec.querySelectorAll("fieldset.product-form__input, fieldset.js.product-form__input");
      for (var fi2 = 0; fi2 < extFieldsets.length; fi2++) {
        var fs = extFieldsets[fi2];
        if (fs.closest(".vd-storefront-root")) continue;
        if (fs.closest('form[action*="/cart/add"]')) continue;
        if (isQuantityOnlyBlock(fs)) continue;
        if (!blockHasVariantUi(fs)) continue;
        hideBlock(fs);
      }

      var extOptRadios = sec.querySelectorAll('input[type="radio"][name^="options"]');
      for (var er = 0; er < extOptRadios.length; er++) {
        var erEl = extOptRadios[er];
        if (erEl.closest(".vd-storefront-root")) continue;
        if (erEl.closest('form[action*="/cart/add"]')) continue;
        var erw =
          erEl.closest("fieldset.product-form__input") ||
          erEl.closest(".product-form__input") ||
          erEl.closest(".variant-picker") ||
          erEl.parentElement;
        hideBlock(erw);
      }
    }
  }

  /**
   * Hides theme product-form quantity UI (+/−, number input, quantity-input host). Cart qty still syncs from the widget.
   */
  function hideThemeNativeQuantitySelectors() {
    if (document.documentElement.getAttribute("data-vd-hide-theme-qty") !== "1") {
      return;
    }
    var seen =
      typeof WeakSet !== "undefined"
        ? new WeakSet()
        : { _a: [], has: function (el) { return this._a.indexOf(el) !== -1; }, add: function (el) { this._a.push(el); } };

    function hideBlock(el) {
      if (!el || el.closest(".vd-storefront-root")) return;
      if (seen.has(el)) return;
      seen.add(el);
      el.style.setProperty("display", "none", "important");
      el.setAttribute("aria-hidden", "true");
    }

    function rowHasVariantUi(el) {
      if (!el || !el.querySelector) return false;
      if (el.querySelector('select[name="id"]')) return true;
      if (el.querySelector('input[type="radio"][name="id"]')) return true;
      if (el.querySelector('select[name^="options"]')) return true;
      if (el.querySelector('input[type="radio"][name^="options"]')) return true;
      if (el.querySelector('input[type="checkbox"][name^="options"]')) return true;
      if (el.querySelector("input.swatch-input")) return true;
      if (el.querySelector("[data-option-value-id]")) return true;
      if (el.querySelector("[data-option-value]")) return true;
      return false;
    }

    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var fi = 0; fi < forms.length; fi++) {
      var form = forms[fi];
      if (form.closest(".vd-storefront-root")) continue;

      var qHosts = form.querySelectorAll("quantity-input");
      for (var hi = 0; hi < qHosts.length; hi++) {
        hideBlock(qHosts[hi]);
      }

      var qtyInputs = form.querySelectorAll(
        'input[type="number"][name="quantity"], input[name="quantity"]:not([type="hidden"]), select[name="quantity"]',
      );
      for (var qi = 0; qi < qtyInputs.length; qi++) {
        var inp = qtyInputs[qi];
        if (String(inp.getAttribute("type") || "").toLowerCase() === "hidden") continue;
        var row = inp.closest("fieldset.product-form__input") || inp.closest(".product-form__input");
        var wrap =
          inp.closest("quantity-input") ||
          inp.closest(".quantity-input") ||
          inp.closest(".product-form__quantity") ||
          inp.closest(".quantity-selector") ||
          inp.closest(".product-form__quantity-wrapper");
        if (row && rowHasVariantUi(row)) {
          var inner =
            inp.closest("quantity-input") ||
            inp.closest(".quantity") ||
            inp.closest("[class*='quantity-selector']");
          hideBlock(inner || wrap || inp.parentElement);
        } else {
          hideBlock(wrap || row || inp.parentElement);
        }
      }
    }

    var sectionRoots = document.querySelectorAll(
      ".shopify-section--main-product, [id^='MainProduct'], product-info, .product--main .product__info",
    );
    for (var sr = 0; sr < sectionRoots.length; sr++) {
      var sec = sectionRoots[sr];
      if (!sec || sec.closest(".vd-storefront-root")) continue;
      var extQ = sec.querySelectorAll("quantity-input");
      for (var xi = 0; xi < extQ.length; xi++) {
        var xq = extQ[xi];
        if (xq.closest(".vd-storefront-root")) continue;
        if (xq.closest('form[action*="/cart/add"]')) continue;
        hideBlock(xq);
      }
    }
  }

  function applyThemePurchaseUiHides() {
    hideThemeNativeAddToCartButtons();
    hideThemeNativeBuyItNowButtons();
    hideThemeNativeVariantSelectors();
    hideThemeNativeQuantitySelectors();
  }

  function ensureThemePurchaseUiHideObserver() {
    if (vdHidePurchaseUiObserver || typeof MutationObserver === "undefined") return;
    vdHidePurchaseUiObserver = new MutationObserver(applyThemePurchaseUiHides);
    vdHidePurchaseUiObserver.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleThemePurchaseUiHides() {
    applyThemePurchaseUiHides();
    ensureThemePurchaseUiHideObserver();
  }

  var FONT_PX_MIN = 10;
  var FONT_PX_MAX = 36;
  var FONT_SCALE_PCT_MIN = 50;
  var FONT_SCALE_PCT_MAX = 200;

  /** Keep in sync with app/utils/widgetFontSizes.ts (LEGACY_STEP_PX). */
  var LEGACY_STEP_PX = {
    title: { sm: 17, md: 19, lg: 24 },
    buyLabel: { sm: 14, md: 16, lg: 18 },
    badge: { sm: 11, md: 12, lg: 13 },
    price: { sm: 14, md: 17, lg: 19 },
    comparePrice: { sm: 12, md: 13, lg: 15 },
    savings: { sm: 11, md: 12, lg: 14 },
    optionSubtext: { sm: 11, md: 12, lg: 14 },
    button: { sm: 14, md: 17, lg: 18 },
    countdownLabel: { sm: 12, md: 13, lg: 14 },
    countdownValue: { sm: 12, md: 13, lg: 14 },
    footnote: { sm: 11, md: 12, lg: 13 },
  };

  var FONT_KEYS = [
    ["title", "fontSizeTitle"],
    ["buyLabel", "fontSizeBuyLabel"],
    ["badge", "fontSizeBadge"],
    ["price", "fontSizePrice"],
    ["comparePrice", "fontSizeComparePrice"],
    ["savings", "fontSizeSavings"],
    ["optionSubtext", "fontSizeOptionSubtext"],
    ["button", "fontSizeButton"],
    ["countdownLabel", "fontSizeCountdownLabel"],
    ["countdownValue", "fontSizeCountdownValue"],
    ["footnote", "fontSizeFootnote"],
  ];

  /** Keep in sync with app/utils/widgetFontSizes.ts (FONT_SCALE_PIXELS). */
  var FONT_SCALE_PIXELS = {
    compact: {
      title: 17,
      buyLabel: 14,
      badge: 11,
      price: 14,
      comparePrice: 12,
      savings: 11,
      optionSubtext: 11,
      button: 14,
      countdownLabel: 12,
      countdownValue: 12,
      footnote: 11,
    },
    default: {
      title: 19,
      buyLabel: 16,
      badge: 12,
      price: 17,
      comparePrice: 13,
      savings: 12,
      optionSubtext: 12,
      button: 17,
      countdownLabel: 13,
      countdownValue: 13,
      footnote: 12,
    },
    comfortable: {
      title: 24,
      buyLabel: 18,
      badge: 13,
      price: 19,
      comparePrice: 15,
      savings: 14,
      optionSubtext: 14,
      button: 18,
      countdownLabel: 14,
      countdownValue: 14,
      footnote: 13,
    },
  };

  function clampFontPx(n) {
    var x = Math.round(Number(n));
    if (!Number.isFinite(x)) return FONT_PX_MIN;
    return Math.min(FONT_PX_MAX, Math.max(FONT_PX_MIN, x));
  }

  function parseFontPx(val, role, presetPx) {
    if (val === undefined || val === null) return clampFontPx(presetPx);
    if (typeof val === "number" && Number.isFinite(val)) return clampFontPx(val);
    var s = String(val).trim().toLowerCase();
    if (s === "sm" || s === "md" || s === "lg") {
      var row = LEGACY_STEP_PX[role];
      return clampFontPx(row ? row[s] : presetPx);
    }
    var parsed = parseInt(s, 10);
    if (!Number.isNaN(parsed)) return clampFontPx(parsed);
    return clampFontPx(presetPx);
  }

  function coerceWidgetFontSizes(d, raw) {
    var scale = d.fontScale === "compact" || d.fontScale === "comfortable" ? d.fontScale : "default";
    d.fontScale = scale;
    var presetRow = FONT_SCALE_PIXELS[scale] || FONT_SCALE_PIXELS.default;
    for (var i = 0; i < FONT_KEYS.length; i++) {
      var role = FONT_KEYS[i][0];
      var key = FONT_KEYS[i][1];
      var inRaw =
        raw &&
        typeof raw === "object" &&
        Object.prototype.hasOwnProperty.call(raw, key);
      var preset = presetRow[role];
      if (!inRaw) {
        d[key] = preset;
      } else {
        d[key] = parseFontPx(d[key], role, preset);
      }
    }
    if (
      raw &&
      typeof raw === "object" &&
      !Object.prototype.hasOwnProperty.call(raw, "fontSizeOptionSubtext") &&
      Object.prototype.hasOwnProperty.call(raw, "fontSizeSavings")
    ) {
      d.fontSizeOptionSubtext = parseFontPx(
        raw.fontSizeSavings,
        "optionSubtext",
        presetRow.optionSubtext,
      );
    }
  }

  function clampFontWeight(n, fallback) {
    var fb = fallback != null ? fallback : 400;
    var x = Math.round(Number(n));
    if (!Number.isFinite(x)) x = fb;
    x = Math.round(x / 100) * 100;
    return Math.min(900, Math.max(100, x));
  }

  function clampScalePct(n) {
    var x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 100;
    return Math.min(FONT_SCALE_PCT_MAX, Math.max(FONT_SCALE_PCT_MIN, x));
  }

  function parseScalePct(val) {
    if (val === undefined || val === null) return 100;
    if (typeof val === "number" && Number.isFinite(val)) return clampScalePct(val);
    var s = String(val).trim().replace(/%/g, "");
    var p = parseInt(s, 10);
    if (!Number.isNaN(p)) return clampScalePct(p);
    return 100;
  }

  function scaledFontPx(base, pct) {
    return clampFontPx(Math.round((clampFontPx(base) * clampScalePct(pct)) / 100));
  }

  function fontSizeToCssScaled(base, pct) {
    return String(scaledFontPx(base, pct)) + "px";
  }

  var RADIUS_PX_MIN = 0;
  var RADIUS_PX_MAX = 32;
  var RADIO_PX_MIN = 10;
  var RADIO_PX_MAX = 36;

  function clampRadioPx(n, fallback) {
    var x = Math.round(Number(n));
    var fb = fallback != null ? fallback : 24;
    if (!Number.isFinite(x)) return fb;
    return Math.min(RADIO_PX_MAX, Math.max(RADIO_PX_MIN, x));
  }

  function pickCountdownTimeUnit(v) {
    var s = String(v || "").trim();
    if (s === "hours" || s === "minutes") return s;
    return "days";
  }

  function pickWidgetHeaderLayout(v) {
    var s = String(v || "").trim();
    if (s === "stacked") return "stacked";
    return "split";
  }

  /** Split + both aligns center → stacked (title above countdown); matches admin preview. */
  function effectiveWidgetHeaderLayout(d) {
    var explicit = pickWidgetHeaderLayout(d.widgetHeaderLayout);
    if (explicit === "stacked") return "stacked";
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "start");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "end");
    if (ha === "center" && ca === "center") return "stacked";
    return explicit;
  }

  /**
   * Split row + heading right + timer left → swap order (timer on the left, title on the right).
   * Matches the common intent of end/start alignments; explicit swap still applies otherwise.
   */
  function effectiveWidgetHeaderSwapOrder(d) {
    var layout = effectiveWidgetHeaderLayout(d);
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "start");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "end");
    if (layout === "split" && ha === "end" && ca === "start") {
      return true;
    }
    return d.widgetHeaderSwapOrder === true;
  }

  function pickWidgetHeaderTextAlign(v, fallback) {
    var s = String(v != null ? v : fallback || "start").trim();
    if (s === "center" || s === "end") return s;
    return "start";
  }

  function countdownAlignToJustify(align) {
    if (align === "start") return "flex-start";
    if (align === "center") return "center";
    return "flex-end";
  }

  function isBadgeTopFloat(pos) {
    return pos === "top_left" || pos === "top_center" || pos === "top_right";
  }

  function badgeTopFloatAlignClass(pos) {
    if (pos === "top_left") return "vd-card__badge-top--align-start";
    if (pos === "top_center") return "vd-card__badge-top--align-center";
    return "vd-card__badge-top--align-end";
  }

  var BADGE_SIZE_PCT_MIN = 60;
  var BADGE_SIZE_PCT_MAX = 160;

  function clampBadgeSizeScalePct(n) {
    var x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 100;
    return Math.min(BADGE_SIZE_PCT_MAX, Math.max(BADGE_SIZE_PCT_MIN, x));
  }

  function applyWidgetHeaderDisplayToRoot(root, d) {
    var layout = effectiveWidgetHeaderLayout(d);
    root.setAttribute("data-vd-header-layout", layout);
    if (d.widgetHeaderMobileStack === true) {
      root.setAttribute("data-vd-header-mobile-stack", "1");
    } else {
      root.removeAttribute("data-vd-header-mobile-stack");
    }
    if (effectiveWidgetHeaderSwapOrder(d)) {
      root.setAttribute("data-vd-header-swap", "1");
    } else {
      root.removeAttribute("data-vd-header-swap");
    }
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "start");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "end");
    root.style.setProperty("--vd-heading-text-align", ha);
    root.style.setProperty("--vd-countdown-justify", countdownAlignToJustify(ca));
  }

  function clampRadiusPx(n, fallback) {
    var x = Math.round(Number(n));
    var fb = fallback != null ? fallback : 14;
    if (!Number.isFinite(x)) return fb;
    return Math.min(RADIUS_PX_MAX, Math.max(RADIUS_PX_MIN, x));
  }

  var VT_PAD_PX_MIN = 4;
  var VT_PAD_PX_MAX = 36;
  function clampVtCellPadPx(n, fallback) {
    var x = Math.round(Number(n));
    var fb = fallback != null ? fallback : 11;
    if (!Number.isFinite(x)) return fb;
    return Math.min(VT_PAD_PX_MAX, Math.max(VT_PAD_PX_MIN, x));
  }

  var VT_COL_INLINE_PAD_PX_MIN = 0;
  var VT_COL_INLINE_PAD_PX_MAX = 36;
  function clampVtColInlinePadPx(n, fallback) {
    var x = Math.round(Number(n));
    var fb = fallback != null ? fallback : 0;
    if (!Number.isFinite(x)) return fb;
    return Math.min(VT_COL_INLINE_PAD_PX_MAX, Math.max(VT_COL_INLINE_PAD_PX_MIN, x));
  }

  var WD_DEFAULT = {
    widgetHeading: "",
    showCountdown: true,
    widgetHeaderLayout: "split",
    widgetHeadingAlign: "start",
    countdownAlign: "end",
    widgetHeaderSwapOrder: false,
    widgetHeaderMobileStack: true,
    widgetPresentation: "tier_cards",
    countdownLabel: "Sale end in",
    countdownTimeAmount: 1,
    countdownTimeUnit: "days",
    ctaLabel: "Grab this deal",
    ctaButtonAction: "add_to_cart_open_drawer",
    ctaButtonPageUrl: "",
    hideThemeAddToCart: false,
    hideThemeBuyItNow: false,
    hideThemeVariantSelector: false,
    hideThemeQuantitySelector: false,
    hideWidgetVariantSelector: false,
    hideOutOfStockVariants: false,
    hideWidgetQuantitySelector: false,
    hideWidgetLineTotal: false,
    hideWidgetTierAddButton: false,
    cardPriceShowsUnit: false,
    hideWidgetComparePrice: false,
    hideWidgetMainCta: false,
    volumeTableCellPaddingPx: 11,
    volumeTableQuantityColumnAlign: "start",
    volumeTableDiscountColumnAlign: "center",
    volumeTablePriceColumnAlign: "end",
    volumeTableQuantityColPaddingStartPx: 12,
    volumeTableQuantityColPaddingEndPx: 10,
    volumeTableDiscountColPaddingStartPx: 10,
    volumeTableDiscountColPaddingEndPx: 10,
    volumeTablePriceColPaddingStartPx: 10,
    volumeTablePriceColPaddingEndPx: 12,
    badgePosition: "after_label",
    badgeBackgroundColor: "#6b1d1e",
    badgeTextColor: "#ffffff",
    badgeSizeScalePercent: 100,
    footnote: "Pick a tier to set quantity, then add to cart.",
    primaryColor: "#6b1d1e",
    primaryHoverColor: "#551618",
    selectedBgColor: "#fff5f5",
    countdownBgColor: "#fce8e8",
    countdownTextColor: "#b42318",
    savingsColor: "#784a4f",
    volumeTableDiscountColor: "#784a4f",
    optionSubtextColor: "#784a4f",
    mutedColor: "#616161",
    cardBorderColor: "#d4d4d4",
    cardBorderRadiusPx: 14,
    buttonBorderRadiusPx: 14,
    controlBorderRadiusPx: 10,
    radioButtonSizePx: 24,
    radioButtonBorderColor: "#bdbdbd",
    radioButtonAccentColor: "#6b1d1e",
    fontScale: "default",
    fontSizeScalePercent: 100,
    fontSizeTitle: 19,
    fontSizeBuyLabel: 16,
    fontSizeBadge: 12,
    fontSizePrice: 17,
    fontSizeComparePrice: 13,
    fontSizeSavings: 12,
    fontSizeOptionSubtext: 12,
    fontSizeButton: 17,
    fontSizeCountdownLabel: 13,
    fontSizeCountdownValue: 13,
    fontSizeFootnote: 12,
    fontWeightStrong: 700,
    fontWeightAccent: 600,
    fontWeightBody: 500,
    fontWeightNormal: 400,
    customCss: "",
  };

  function parseVariantsFromRoot(root) {
    var el = root.querySelector("script[data-vd-variants-json]");
    if (!el || !el.textContent) return [];
    try {
      var arr = JSON.parse(el.textContent.trim());
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  var vdProductJsonPromise = null;

  function guessProductJsonUrlFromPath() {
    var p = String(window.location.pathname || "");
    var m = p.match(/(\/products\/[^/?#]+)/i);
    if (!m || !m[1]) return "";
    return m[1] + ".js";
  }

  function fetchProductJsonForPage() {
    if (vdProductJsonPromise) return vdProductJsonPromise;
    var u = guessProductJsonUrlFromPath();
    if (!u) {
      vdProductJsonPromise = Promise.resolve(null);
      return vdProductJsonPromise;
    }
    vdProductJsonPromise = fetch(u, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-cache",
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        return null;
      });
    return vdProductJsonPromise;
  }

  function readThemeVariantIdForHydration() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var fi = 0; fi < forms.length; fi++) {
      var form = forms[fi];
      if (form.closest(".vd-storefront-root")) continue;
      var vs = form.querySelector('select[name="id"]');
      if (vs && vs.value) return String(vs.value);
      var hid = form.querySelector('input[name="id"][type="hidden"]');
      if (hid && hid.value) return String(hid.value);
      var rid = form.querySelector('input[type="radio"][name="id"]:checked');
      if (rid && rid.value) return String(rid.value);
    }
    return "";
  }

  function hydrateRootProductDataFromJson(root) {
    if (root.getAttribute("data-product-id")) {
      return Promise.resolve(true);
    }
    if (root.getAttribute("data-vd-hydrating") === "1") {
      return Promise.resolve(false);
    }
    root.setAttribute("data-vd-hydrating", "1");
    return fetchProductJsonForPage()
      .then(function (pj) {
        if (!pj || !pj.id) return false;
        var productId = String(pj.id);
        root.setAttribute("data-product-id", productId);
        root.setAttribute("data-product-gid", "gid://shopify/Product/" + productId);

        var wantedVid = readThemeVariantIdForHydration();
        var variants = Array.isArray(pj.variants) ? pj.variants : [];
        var chosen = null;
        for (var i = 0; i < variants.length; i++) {
          if (String(variants[i].id) === String(wantedVid)) {
            chosen = variants[i];
            break;
          }
        }
        if (!chosen && variants.length) {
          for (var ai = 0; ai < variants.length; ai++) {
            if (variants[ai] && variants[ai].available) {
              chosen = variants[ai];
              break;
            }
          }
          if (!chosen) chosen = variants[0];
        }
        if (!chosen) return false;

        root.setAttribute("data-variant-id", String(chosen.id));
        root.setAttribute("data-variant-gid", "gid://shopify/ProductVariant/" + String(chosen.id));
        var unit = parseInt(String(chosen.price), 10);
        if (Number.isFinite(unit) && unit > 0) {
          root.setAttribute("data-unit-price-cents", String(unit));
        }

        var variantsScript = root.querySelector("script[data-vd-variants-json]");
        if (!variantsScript) {
          variantsScript = document.createElement("script");
          variantsScript.type = "application/json";
          variantsScript.setAttribute("data-vd-variants-json", "");
          root.insertBefore(variantsScript, root.firstChild);
        }
        variantsScript.textContent = JSON.stringify(
          variants.map(function (v) {
            return {
              id: v.id,
              title: v.title || "Variant",
              price: v.price,
              available: v.available !== false,
            };
          }),
        );
        return true;
      })
      .catch(function () {
        return false;
      })
      .then(function (ok) {
        root.removeAttribute("data-vd-hydrating");
        return ok;
      });
  }

  var VD_CUSTOM_CSS_MAX_CHARS = 32000;

  function mergeWidgetDisplay(raw) {
    var d = {};
    for (var k in WD_DEFAULT) {
      if (Object.prototype.hasOwnProperty.call(WD_DEFAULT, k)) {
        d[k] = WD_DEFAULT[k];
      }
    }
    if (raw && typeof raw === "object") {
      for (var k2 in WD_DEFAULT) {
        if (Object.prototype.hasOwnProperty.call(raw, k2) && raw[k2] !== undefined && raw[k2] !== null) {
          d[k2] = raw[k2];
        }
      }
    }
    coerceWidgetFontSizes(d, raw && typeof raw === "object" ? raw : null);
    d.fontSizeScalePercent = parseScalePct(d.fontSizeScalePercent);
    d.fontWeightStrong = clampFontWeight(d.fontWeightStrong, WD_DEFAULT.fontWeightStrong);
    d.fontWeightAccent = clampFontWeight(d.fontWeightAccent, WD_DEFAULT.fontWeightAccent);
    d.fontWeightBody = clampFontWeight(d.fontWeightBody, WD_DEFAULT.fontWeightBody);
    d.fontWeightNormal = clampFontWeight(d.fontWeightNormal, WD_DEFAULT.fontWeightNormal);
    var r = raw && typeof raw === "object" ? raw : null;
    if (!r || !Object.prototype.hasOwnProperty.call(r, "badgeBackgroundColor")) {
      d.badgeBackgroundColor = d.primaryColor;
    }
    if (!r || !Object.prototype.hasOwnProperty.call(r, "badgeTextColor")) {
      d.badgeTextColor = "#ffffff";
    }
    if (!r || !Object.prototype.hasOwnProperty.call(r, "volumeTableDiscountColor")) {
      d.volumeTableDiscountColor = d.savingsColor;
    }
    d.customCss = String(d.customCss != null ? d.customCss : "").slice(0, VD_CUSTOM_CSS_MAX_CHARS);
    d.cardBorderRadiusPx = clampRadiusPx(d.cardBorderRadiusPx, WD_DEFAULT.cardBorderRadiusPx);
    d.buttonBorderRadiusPx = clampRadiusPx(d.buttonBorderRadiusPx, WD_DEFAULT.buttonBorderRadiusPx);
    d.controlBorderRadiusPx = clampRadiusPx(d.controlBorderRadiusPx, WD_DEFAULT.controlBorderRadiusPx);
    d.radioButtonSizePx = clampRadioPx(d.radioButtonSizePx, WD_DEFAULT.radioButtonSizePx);
    d.volumeTableCellPaddingPx = clampVtCellPadPx(
      d.volumeTableCellPaddingPx,
      WD_DEFAULT.volumeTableCellPaddingPx,
    );
    d.volumeTableQuantityColumnAlign = pickWidgetHeaderTextAlign(
      d.volumeTableQuantityColumnAlign,
      WD_DEFAULT.volumeTableQuantityColumnAlign,
    );
    d.volumeTableDiscountColumnAlign = pickWidgetHeaderTextAlign(
      d.volumeTableDiscountColumnAlign,
      WD_DEFAULT.volumeTableDiscountColumnAlign,
    );
    d.volumeTablePriceColumnAlign = pickWidgetHeaderTextAlign(
      d.volumeTablePriceColumnAlign,
      WD_DEFAULT.volumeTablePriceColumnAlign,
    );
    d.volumeTableQuantityColPaddingStartPx = clampVtColInlinePadPx(
      d.volumeTableQuantityColPaddingStartPx,
      WD_DEFAULT.volumeTableQuantityColPaddingStartPx,
    );
    d.volumeTableQuantityColPaddingEndPx = clampVtColInlinePadPx(
      d.volumeTableQuantityColPaddingEndPx,
      WD_DEFAULT.volumeTableQuantityColPaddingEndPx,
    );
    d.volumeTableDiscountColPaddingStartPx = clampVtColInlinePadPx(
      d.volumeTableDiscountColPaddingStartPx,
      WD_DEFAULT.volumeTableDiscountColPaddingStartPx,
    );
    d.volumeTableDiscountColPaddingEndPx = clampVtColInlinePadPx(
      d.volumeTableDiscountColPaddingEndPx,
      WD_DEFAULT.volumeTableDiscountColPaddingEndPx,
    );
    d.volumeTablePriceColPaddingStartPx = clampVtColInlinePadPx(
      d.volumeTablePriceColPaddingStartPx,
      WD_DEFAULT.volumeTablePriceColPaddingStartPx,
    );
    d.volumeTablePriceColPaddingEndPx = clampVtColInlinePadPx(
      d.volumeTablePriceColPaddingEndPx,
      WD_DEFAULT.volumeTablePriceColPaddingEndPx,
    );
    d.widgetHeaderLayout = pickWidgetHeaderLayout(d.widgetHeaderLayout);
    d.widgetHeadingAlign = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "start");
    d.countdownAlign = pickWidgetHeaderTextAlign(d.countdownAlign, "end");
    d.widgetHeaderSwapOrder = d.widgetHeaderSwapOrder === true;
    d.widgetHeaderMobileStack = d.widgetHeaderMobileStack === true;
    d.badgeSizeScalePercent = clampBadgeSizeScalePct(d.badgeSizeScalePercent);
    d.countdownTimeUnit = pickCountdownTimeUnit(d.countdownTimeUnit);
    var cdAmt = Math.floor(Number(d.countdownTimeAmount));
    d.countdownTimeAmount =
      !Number.isFinite(cdAmt) || cdAmt < 1 ? 1 : Math.min(9999, cdAmt);
    return d;
  }

  function applyVolumeDiscountCustomCss(root, css) {
    var text = String(css != null ? css : "")
      .slice(0, VD_CUSTOM_CSS_MAX_CHARS)
      .trim();
    var el = root.querySelector("style[data-vd-custom-css]");
    if (!text) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-vd-custom-css", "");
      el.setAttribute("type", "text/css");
      root.insertBefore(el, root.firstChild);
    }
    el.textContent = text;
  }

  function applyWidgetDisplayToRoot(root, disp, themeHeading) {
    var d = mergeWidgetDisplay(disp);
    root.removeAttribute("data-vd-font-scale");
    if (d.fontScale === "compact") root.setAttribute("data-vd-font-scale", "compact");
    else if (d.fontScale === "comfortable") root.setAttribute("data-vd-font-scale", "comfortable");

    applyWidgetHeaderDisplayToRoot(root, d);

    root.style.setProperty("--vd-maroon", String(d.primaryColor));
    root.style.setProperty("--vd-maroon-cta-hover", String(d.primaryHoverColor));
    root.style.setProperty("--vd-pink-bg", String(d.selectedBgColor));
    root.style.setProperty("--vd-countdown-bg", String(d.countdownBgColor));
    root.style.setProperty("--vd-countdown-text", String(d.countdownTextColor));
    root.style.setProperty("--vd-save", String(d.savingsColor));
    root.style.setProperty(
      "--vd-vt-discount-fg",
      String(d.volumeTableDiscountColor || d.savingsColor),
    );
    root.style.setProperty(
      "--vd-option-subtext",
      String(d.optionSubtextColor || d.savingsColor),
    );
    root.style.setProperty("--vd-muted", String(d.mutedColor));
    root.style.setProperty("--vd-card-border", String(d.cardBorderColor));
    root.style.setProperty(
      "--vd-radius-card",
      String(clampRadiusPx(d.cardBorderRadiusPx, 14)) + "px",
    );
    root.style.setProperty(
      "--vd-radius-cta",
      String(clampRadiusPx(d.buttonBorderRadiusPx, 14)) + "px",
    );
    root.style.setProperty(
      "--vd-radius-control",
      String(clampRadiusPx(d.controlBorderRadiusPx, WD_DEFAULT.controlBorderRadiusPx)) + "px",
    );
    root.style.setProperty("--vd-maroon-border", String(d.primaryColor));
    root.style.setProperty("--vd-badge-bg", String(d.badgeBackgroundColor));
    root.style.setProperty("--vd-badge-text", String(d.badgeTextColor));
    root.style.setProperty(
      "--vd-badge-size-scale",
      String(clampBadgeSizeScalePct(d.badgeSizeScalePercent) / 100),
    );
    root.style.setProperty(
      "--vd-radio",
      String(clampRadioPx(d.radioButtonSizePx, WD_DEFAULT.radioButtonSizePx)) + "px",
    );
    root.style.setProperty(
      "--vd-radio-border",
      String(d.radioButtonBorderColor != null ? d.radioButtonBorderColor : "#bdbdbd"),
    );
    root.style.setProperty(
      "--vd-radio-accent",
      String(
        d.radioButtonAccentColor != null && String(d.radioButtonAccentColor).trim() !== ""
          ? d.radioButtonAccentColor
          : d.primaryColor,
      ),
    );

    var sp = d.fontSizeScalePercent;
    root.style.setProperty("--vd-fs-title", fontSizeToCssScaled(d.fontSizeTitle, sp));
    root.style.setProperty("--vd-fs-buy", fontSizeToCssScaled(d.fontSizeBuyLabel, sp));
    root.style.setProperty("--vd-fs-badge", fontSizeToCssScaled(d.fontSizeBadge, sp));
    root.style.setProperty("--vd-fs-price", fontSizeToCssScaled(d.fontSizePrice, sp));
    root.style.setProperty("--vd-fs-compare", fontSizeToCssScaled(d.fontSizeComparePrice, sp));
    root.style.setProperty("--vd-fs-save", fontSizeToCssScaled(d.fontSizeSavings, sp));
    root.style.setProperty(
      "--vd-fs-option-subtext",
      fontSizeToCssScaled(d.fontSizeOptionSubtext, sp),
    );
    root.style.setProperty("--vd-fs-cta", fontSizeToCssScaled(d.fontSizeButton, sp));
    root.style.setProperty("--vd-fs-cd-label", fontSizeToCssScaled(d.fontSizeCountdownLabel, sp));
    root.style.setProperty("--vd-fs-cd-badge", fontSizeToCssScaled(d.fontSizeCountdownValue, sp));
    root.style.setProperty("--vd-fs-footnote", fontSizeToCssScaled(d.fontSizeFootnote, sp));
    root.style.setProperty("--vd-fw-strong", String(d.fontWeightStrong));
    root.style.setProperty("--vd-fw-accent", String(d.fontWeightAccent));
    root.style.setProperty("--vd-fw-body", String(d.fontWeightBody));
    root.style.setProperty("--vd-fw-normal", String(d.fontWeightNormal));
    root.style.setProperty(
      "--vd-vt-cell-pad-block",
      String(clampVtCellPadPx(d.volumeTableCellPaddingPx, WD_DEFAULT.volumeTableCellPaddingPx)) +
        "px",
    );
    root.style.setProperty(
      "--vd-vt-col1-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTableQuantityColumnAlign, "start")),
    );
    root.style.setProperty(
      "--vd-vt-col2-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTableDiscountColumnAlign, "center")),
    );
    root.style.setProperty(
      "--vd-vt-col3-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTablePriceColumnAlign, "end")),
    );
    root.style.setProperty(
      "--vd-vt-col1-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTableQuantityColPaddingStartPx,
          WD_DEFAULT.volumeTableQuantityColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--vd-vt-col1-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTableQuantityColPaddingEndPx,
          WD_DEFAULT.volumeTableQuantityColPaddingEndPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--vd-vt-col2-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTableDiscountColPaddingStartPx,
          WD_DEFAULT.volumeTableDiscountColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--vd-vt-col2-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTableDiscountColPaddingEndPx,
          WD_DEFAULT.volumeTableDiscountColPaddingEndPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--vd-vt-col3-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTablePriceColPaddingStartPx,
          WD_DEFAULT.volumeTablePriceColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--vd-vt-col3-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTablePriceColPaddingEndPx,
          WD_DEFAULT.volumeTablePriceColPaddingEndPx,
        ),
      ) + "px",
    );

    applyVolumeDiscountCustomCss(root, d.customCss);

    var h = String(d.widgetHeading || "").trim();
    var ctaAct = String(d.ctaButtonAction || "add_to_cart_open_drawer");
    if (
      ctaAct !== "add_to_cart" &&
      ctaAct !== "add_to_cart_open_drawer" &&
      ctaAct !== "go_to_checkout" &&
      ctaAct !== "go_to_page"
    ) {
      ctaAct = "add_to_cart_open_drawer";
    }
    var pres = String(d.widgetPresentation || "").trim();
    return {
      title: h || String(themeHeading || "").trim() || "Quantity breaks",
      widgetPresentation: pres === "volume_table" ? "volume_table" : "tier_cards",
      showCountdown: d.showCountdown !== false,
      countdownLabel: String(d.countdownLabel || WD_DEFAULT.countdownLabel).trim() ||
        WD_DEFAULT.countdownLabel,
      countdownTimeUnit: pickCountdownTimeUnit(d.countdownTimeUnit),
      ctaLabel: String(d.ctaLabel || "Grab this deal").trim() || "Grab this deal",
      footnote: String(d.footnote || WD_DEFAULT.footnote).trim() || WD_DEFAULT.footnote,
      ctaButtonAction: ctaAct,
      ctaButtonPageUrl: String(d.ctaButtonPageUrl || "").trim(),
      hideThemeAddToCart: d.hideThemeAddToCart === true,
      hideThemeBuyItNow: d.hideThemeBuyItNow === true,
      hideThemeVariantSelector: d.hideThemeVariantSelector === true,
      hideThemeQuantitySelector: d.hideThemeQuantitySelector === true,
      hideWidgetVariantSelector: d.hideWidgetVariantSelector === true,
      hideWidgetQuantitySelector: d.hideWidgetQuantitySelector === true,
      hideWidgetLineTotal: d.hideWidgetLineTotal === true,
      hideWidgetTierAddButton: d.hideWidgetTierAddButton === true,
      cardPriceShowsUnit: d.cardPriceShowsUnit === true,
      hideWidgetComparePrice: d.hideWidgetComparePrice === true,
      hideWidgetMainCta: d.hideWidgetMainCta === true,
      hideOutOfStockVariants: d.hideOutOfStockVariants === true,
      badgePosition: (function () {
        var p = String(d.badgePosition || "after_label");
        if (
          p === "after_label" ||
          p === "below_label" ||
          p === "after_subtext" ||
          p === "top_left" ||
          p === "top_center" ||
          p === "top_right" ||
          p === "price_column"
        ) {
          return p;
        }
        if (p === "after_subtext_right") {
          return "after_subtext";
        }
        return "after_label";
      })(),
    };
  }

  function mountBundle(
    root,
    mountEl,
    campaign,
    radioName,
    unitCents,
    currency,
    heading,
    sectionHeading,
    variants,
  ) {
    clearCountdown(root);

    var ui = applyWidgetDisplayToRoot(root, campaign.widgetDisplay, heading);
    var isVolumeTable = ui.widgetPresentation === "volume_table";

    if (ui.hideThemeAddToCart) {
      document.documentElement.setAttribute("data-vd-hide-theme-atc", "1");
    }
    if (ui.hideThemeBuyItNow) {
      document.documentElement.setAttribute("data-vd-hide-theme-bin", "1");
    }
    if (ui.hideThemeVariantSelector) {
      document.documentElement.setAttribute("data-vd-hide-theme-variant", "1");
    }
    if (ui.hideThemeQuantitySelector) {
      document.documentElement.setAttribute("data-vd-hide-theme-qty", "1");
    }
    if (
      ui.hideThemeAddToCart ||
      ui.hideThemeBuyItNow ||
      ui.hideThemeVariantSelector ||
      ui.hideThemeQuantitySelector
    ) {
      scheduleThemePurchaseUiHides();
    }

    var tiers = campaign.tiers.slice().sort(function (a, b) {
      return (a.minQty | 0) - (b.minQty | 0);
    });
    var defaultIdx = 0;
    for (var gi = 0; gi < tiers.length; gi++) {
      if (tiers[gi].activeByDefault) {
        defaultIdx = gi;
        break;
      }
    }

    var vidRoot = String(root.getAttribute("data-variant-id") || "");
    if (!variants || !variants.length) {
      if (vidRoot) {
        variants = [
          {
            id: parseInt(vidRoot, 10) || vidRoot,
            title: "Default",
            price: unitCents,
          },
        ];
      } else {
        variants = [{ id: 1, title: "Default", price: unitCents }];
      }
    }

    var variantsInventoryCatalog = variants.slice();

    if (ui.hideOutOfStockVariants === true && variants.length > 0) {
      var filteredOos = [];
      for (var oi = 0; oi < variants.length; oi++) {
        var ov = variants[oi];
        if (ov && ov.available !== false) filteredOos.push(ov);
      }
      if (filteredOos.length) variants = filteredOos;
    }
    if (vidRoot) {
      var vidOk = false;
      for (var vli = 0; vli < variants.length; vli++) {
        if (String(variants[vli].id) === String(vidRoot)) {
          vidOk = variants[vli].available !== false;
          break;
        }
      }
      if (!vidOk) vidRoot = "";
    }

    var currentUnitCents = unitCents;
    var stateQty = Math.max(1, tiers[defaultIdx].minQty | 0);
    var rn = "vd-tier-" + String(radioName).replace(/[^a-zA-Z0-9_-]/g, "-");

    function readThemeProductFormVariantId() {
      var forms = document.querySelectorAll('form[action*="/cart/add"]');
      for (var fi = 0; fi < forms.length; fi++) {
        var form = forms[fi];
        if (form.closest(".vd-storefront-root")) continue;
        var vs = form.querySelector('select[name="id"]');
        if (vs && vs.value) return String(vs.value);
        var hid = form.querySelector('input[name="id"][type="hidden"]');
        if (hid && hid.value) return String(hid.value);
      }
      return "";
    }

    function resolveActiveVariantIdForCart() {
      if (vdShowVariant) {
        var selAdd = mountEl.querySelector(".vd-card--selected .vd-variant-select");
        if (!selAdd) {
          selAdd = mountEl.querySelector(".vd-variant-select");
        }
        if (selAdd) return String(selAdd.value);
      }
      var fromForm = readThemeProductFormVariantId();
      if (fromForm) return fromForm;
      return String(root.getAttribute("data-variant-id") || "");
    }

    function isVariantAvailableForCart(vid) {
      if (!vid) return false;
      for (var ii = 0; ii < variantsInventoryCatalog.length; ii++) {
        var ent = variantsInventoryCatalog[ii];
        if (String(ent.id) !== String(vid)) continue;
        return ent.available !== false;
      }
      return true;
    }

    function firstAvailableVariantIdInList(list) {
      if (!list || !list.length) return "";
      for (var fa = 0; fa < list.length; fa++) {
        if (list[fa].available !== false) return String(list[fa].id);
      }
      return String(list[0].id);
    }

    /** Single “Default Title” variant → no real choice; hide picker (matches Shopify simple products). */
    function shouldShowVariantPicker(vs) {
      if (!vs || vs.length === 0) return false;
      if (vs.length > 1) return true;
      var t = String(vs[0].title || "")
        .trim()
        .toLowerCase();
      return t !== "default title";
    }
    var vdShowVariant =
      shouldShowVariantPicker(variants) && ui.hideWidgetVariantSelector !== true;

    function readPriceForVariant(vid) {
      for (var vi = 0; vi < variants.length; vi++) {
        if (String(variants[vi].id) === String(vid)) {
          var p = parseInt(String(variants[vi].price), 10);
          return Number.isFinite(p) && p > 0 ? p : currentUnitCents;
        }
      }
      return currentUnitCents;
    }

    function variantOptionsHtml(selId) {
      var o = [];
      for (var vi = 0; vi < variants.length; vi++) {
        var v = variants[vi];
        var id = String(v.id);
        var pr = parseInt(String(v.price), 10) || 0;
        var sel = id === String(selId) ? " selected" : "";
        var dis = v.available === false ? " disabled" : "";
        o.push(
          '<option value="' +
            id +
            '" data-price="' +
            pr +
            '"' +
            sel +
            dis +
            ">" +
            esc(String(v.title || "Variant")) +
            "</option>",
        );
      }
      return o.join("");
    }

    function expandHtml(c, selId) {
      var selectBlock = vdShowVariant
        ? '<div class="vd-select-wrap"><select class="vd-variant-select" aria-label="Variant">' +
          variantOptionsHtml(selId) +
          "</select></div>"
        : "";
      var qtyBlock = ui.hideWidgetQuantitySelector
        ? ""
        : '<div class="vd-qty-group" role="group" aria-label="Quantity">' +
          '<button type="button" class="vd-qty-btn" data-vd-qty-dec aria-label="Decrease quantity"><span aria-hidden="true">−</span></button>' +
          '<input type="text" class="vd-qty-value" data-vd-qty-display inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="' +
          String(String(VD_MAX_LINE_QTY).length) +
          '" aria-label="Quantity" value="' +
          stateQty +
          '" />' +
          '<button type="button" class="vd-qty-btn" data-vd-qty-inc aria-label="Increase quantity"><span aria-hidden="true">+</span></button>' +
          "</div>";
      var qtyStack =
        qtyBlock === ""
          ? ""
          : '<div class="vd-qty-stack">' +
            qtyBlock +
            '<p class="vd-cart-qty-alert" data-vd-cart-qty-alert hidden tabindex="-1"></p>' +
            "</div>";
      var lineTotalBlock = ui.hideWidgetLineTotal
        ? ""
        : '<span class="vd-line-total" data-vd-line-total></span>';
      var tierAddBtn = ui.hideWidgetTierAddButton
        ? ""
        : '<button type="button" class="vd-add-outline" data-vd-tier-add>+ Add</button>';
      var trailingInner = qtyStack + tierAddBtn;
      var trailingHtml = trailingInner
        ? '<div class="vd-expand-trailing">' + trailingInner + "</div>"
        : "";
      if (!selectBlock && !lineTotalBlock && !trailingHtml) {
        return "";
      }
      var expandClasses = "vd-expand-compact";
      if (!vdShowVariant) expandClasses += " vd-expand-compact--no-variant";
      if (ui.hideWidgetQuantitySelector) expandClasses += " vd-expand-compact--no-qty";
      if (ui.hideWidgetLineTotal) expandClasses += " vd-expand-compact--no-line-total";
      return (
        '<div class="vd-card__expand">' +
        '<div class="vd-card__divider" aria-hidden="true"></div>' +
        '<div class="' +
        expandClasses +
        '">' +
        '<span class="vd-tier-idx">#' +
        (c + 1) +
        "</span>" +
        selectBlock +
        lineTotalBlock +
        trailingHtml +
        "</div>" +
        "</div>"
      );
    }

    /** Tier min for clamping qty. Volume table: derived from quantity (no row radios). */
    function getTierMinQty(forQty) {
      if (isVolumeTable) {
        var q = (forQty != null ? forQty : stateQty) | 0;
        if (q < 1) q = 1;
        var best = tiers[0];
        for (var tqi = 0; tqi < tiers.length; tqi++) {
          if (q >= (tiers[tqi].minQty | 0)) best = tiers[tqi];
        }
        return Math.max(1, best.minQty | 0);
      }
      var checked = mountEl.querySelector('input[name="' + rn + '"]:checked');
      return checked ? parseInt(String(checked.value), 10) || 1 : 1;
    }

    function clampQty() {
      var m = getTierMinQty();
      if (stateQty < m) stateQty = m;
      if (stateQty > VD_MAX_LINE_QTY) stateQty = VD_MAX_LINE_QTY;
    }

    function updateAllPrices() {
      var uc = currentUnitCents;
      if (isVolumeTable) {
        var trows = mountEl.querySelectorAll(".vd-volume-tier-row");
        for (var vi = 0; vi < tiers.length; vi++) {
          var vt = tiers[vi];
          var vu = tierUnitCents(uc, vt);
          var vrow = trows[vi];
          if (!vrow) continue;
          var vmain = vrow.querySelector("[data-vd-main-price]");
          if (vmain) vmain.textContent = fmtMoney(vu, currency);
          var vdisc = vrow.querySelector("[data-vd-discount-cell]");
          if (vdisc) vdisc.textContent = tierVolumeTableDiscountLabel(vt);
        }
        return;
      }
      var perUnitCards = ui.cardPriceShowsUnit === true;
      var cards = mountEl.querySelectorAll(".vd-card");
      for (var i = 0; i < tiers.length; i++) {
        var d = tiers[i];
        var lt = lineTotals(uc, d);
        var P = Math.max(0, lt.original - lt.discounted);
        var minQ = lt.minQty;
        var u = tierUnitCents(uc, d);
        var card = cards[i];
        if (!card) continue;
        var strike = card.querySelector("[data-vd-strike]");
        var save = card.querySelector("[data-vd-you-save]");
        var mainP = card.querySelector("[data-vd-main-price]");
        if (mainP) mainP.textContent = fmtMoney(perUnitCards ? u : lt.discounted, currency);
        var showStrikeSave = perUnitCards ? P > 0 && u < uc : minQ > 1 && P > 0;
        var hideCompare = ui.hideWidgetComparePrice === true;
        if (showStrikeSave) {
          if (strike) {
            if (hideCompare) {
              strike.style.display = "none";
            } else {
              strike.textContent = fmtMoney(perUnitCards ? uc : lt.original, currency);
              strike.style.display = "";
            }
          }
          if (save) {
            save.textContent = "You save " + fmtMoney(P, currency);
            save.style.display = "";
          }
        } else {
          if (strike) strike.style.display = "none";
          if (save) save.style.display = "none";
        }
      }
    }

    function updateAllLineTotals() {
      var uc = currentUnitCents;
      var cards = mountEl.querySelectorAll(".vd-card");
      for (var i = 0; i < tiers.length; i++) {
        var card = cards[i];
        if (!card) continue;
        var el = card.querySelector("[data-vd-line-total]");
        if (!el) continue;
        var per = tierUnitCents(uc, tiers[i]);
        el.textContent = fmtMoney(per * stateQty, currency);
      }
    }

    function applyQtyFromInput(el) {
      if (!el || el.tagName !== "INPUT") return;
      var raw = String(el.value != null ? el.value : "").trim();
      var n = parseInt(raw, 10);
      if (isVolumeTable) {
        if (!Number.isFinite(n) || raw === "") {
          updateQtyDisplay();
          return;
        }
        n = Math.max(1, Math.min(VD_MAX_LINE_QTY, n));
        var vm = getTierMinQty(n);
        if (n < vm) n = vm;
        stateQty = n;
        updateQtyDisplay();
        return;
      }
      var m = getTierMinQty();
      if (!Number.isFinite(n) || raw === "") n = m;
      if (n < m) n = m;
      if (n > VD_MAX_LINE_QTY) n = VD_MAX_LINE_QTY;
      stateQty = n;
      updateQtyDisplay();
    }

    function updateQtyDisplay() {
      clearVdCartQtyAlert();
      clampQty();
      var m = getTierMinQty();
      var str = String(stateQty);
      var nodes = mountEl.querySelectorAll("[data-vd-qty-display]");
      for (var qi = 0; qi < nodes.length; qi++) {
        var n = nodes[qi];
        if (n.tagName === "INPUT") {
          n.setAttribute("maxlength", String(String(VD_MAX_LINE_QTY).length));
          n.setAttribute("inputmode", "numeric");
          if (document.activeElement !== n) n.value = str;
        } else {
          n.textContent = str;
        }
      }
      var decs = mountEl.querySelectorAll("[data-vd-qty-dec]");
      for (var dj = 0; dj < decs.length; dj++) {
        decs[dj].disabled = stateQty <= m;
      }
      updateAllLineTotals();
      syncQtyToForm();
    }

    function syncQtyToForm() {
      var form = document.querySelector('form[action*="/cart/add"]');
      if (!form) return;
      var inp = form.querySelector('input[name="quantity"]');
      if (inp) {
        inp.value = String(stateQty);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    function syncFormVariant(vid) {
      var form = document.querySelector('form[action*="/cart/add"]');
      if (!form) return;
      var vs = form.querySelector('select[name="id"]');
      if (vs) {
        vs.value = String(vid);
        vs.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var hid = form.querySelector('input[name="id"][type="hidden"]');
      if (hid) {
        hid.value = String(vid);
        hid.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    function syncAllVariantSelects(vid) {
      if (!vdShowVariant) return;
      var sels = mountEl.querySelectorAll(".vd-variant-select");
      for (var si = 0; si < sels.length; si++) {
        sels[si].value = String(vid);
      }
    }

    function scrollToAtc() {
      clampQty();
      syncQtyToForm();
      var sel = mountEl.querySelector(".vd-card--selected .vd-variant-select");
      if (sel) {
        syncFormVariant(sel.value);
        root.setAttribute("data-variant-id", String(sel.value));
      } else {
        var fb = readThemeProductFormVariantId() || root.getAttribute("data-variant-id");
        if (fb) syncFormVariant(fb);
      }
      var form = document.querySelector('form[action*="/cart/add"]');
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        var btn =
          form.querySelector('button[type="submit"]') ||
          form.querySelector('[name="add"]') ||
          form.querySelector("button");
        if (btn && typeof btn.focus === "function") btn.focus();
      }
    }

    function syncSelectedCard() {
      var labels = mountEl.querySelectorAll(".vd-card");
      for (var i = 0; i < labels.length; i++) {
        var lab = labels[i];
        var inp = lab.querySelector("input[type=radio]");
        lab.classList.toggle("vd-card--selected", !!(inp && inp.checked));
      }
    }

    function tierVolumeTableDiscountLabel(tier) {
      if (tier.percent != null && tier.percent !== undefined) {
        return String(Math.round(Number(tier.percent))) + "%";
      }
      if (
        tier.fixedPricePerUnit != null &&
        tier.fixedPricePerUnit !== undefined
      ) {
        return fmtMoney(Math.round(Number(tier.fixedPricePerUnit) * 100), currency);
      }
      if (tier.fixedAmount != null && tier.fixedAmount !== undefined) {
        return "\u2212" + fmtMoney(Math.round(Number(tier.fixedAmount) * 100), currency);
      }
      return "\u2014";
    }

    var vdCartMaxQtyRedirectTimer = null;

    function clearVdCartQtyAlert() {
      if (vdCartMaxQtyRedirectTimer != null) {
        clearTimeout(vdCartMaxQtyRedirectTimer);
        vdCartMaxQtyRedirectTimer = null;
      }
      var nodes = mountEl.querySelectorAll(
        "[data-vd-cart-qty-alert], [data-vd-cart-qty-alert-global]",
      );
      for (var ci = 0; ci < nodes.length; ci++) {
        nodes[ci].setAttribute("hidden", "");
        nodes[ci].textContent = "";
      }
    }

    function getVdActiveCartQtyAlertEl() {
      var per = mountEl.querySelector(".vd-card--selected [data-vd-cart-qty-alert]");
      if (per) return per;
      return mountEl.querySelector("[data-vd-cart-qty-alert-global]");
    }

    function showVdCartMaxQtyMessageAndGoToCart() {
      clearVdCartQtyAlert();
      var alertEl = getVdActiveCartQtyAlertEl();
      var msg =
        (typeof window.VolumeDiscount !== "undefined" &&
          window.VolumeDiscount.messages &&
          window.VolumeDiscount.messages.cartMaxQty) ||
        VD_MSG_CART_MAX_QTY;
      if (alertEl) {
        alertEl.textContent = msg;
        alertEl.removeAttribute("hidden");
        try {
          alertEl.focus();
        } catch (fe) {
          void fe;
        }
      }
      vdCartMaxQtyRedirectTimer = setTimeout(function () {
        vdCartMaxQtyRedirectTimer = null;
        window.location.href = shopifyRoutesRoot() + "cart";
      }, 1800);
    }

    function showVdOutOfStockMessage() {
      var el = mountEl.querySelector("[data-vd-stock-alert]");
      if (!el) return;
      el.textContent =
        (typeof window.VolumeDiscount !== "undefined" &&
          window.VolumeDiscount.messages &&
          window.VolumeDiscount.messages.soldOut) ||
        "This variant is sold out.";
      el.removeAttribute("hidden");
      try {
        el.focus();
      } catch (e) {
        void e;
      }
      clearTimeout(el._vdStockT);
      el._vdStockT = setTimeout(function () {
        el.setAttribute("hidden", "");
        el.textContent = "";
      }, 7000);
    }

    function updatePurchaseControlsAvailability() {
      var vidNow = resolveActiveVariantIdForCart();
      var purchasable = isVariantAvailableForCart(vidNow);
      var ctaEl = mountEl.querySelector("[data-vd-cta]");
      if (ctaEl) ctaEl.disabled = !purchasable;
      var tierAdds = mountEl.querySelectorAll("[data-vd-tier-add]");
      for (var tax = 0; tax < tierAdds.length; tax++) {
        tierAdds[tax].disabled = !purchasable;
      }
      var ael = mountEl.querySelector("[data-vd-stock-alert]");
      if (ael && purchasable) {
        clearTimeout(ael._vdStockT);
        ael.setAttribute("hidden", "");
        ael.textContent = "";
      }
    }

    var cdEndsMs =
      campaign.countdownEndsAt != null
        ? Date.parse(String(campaign.countdownEndsAt))
        : NaN;
    var cdStartsMs =
      campaign.countdownStartsAt != null
        ? Date.parse(String(campaign.countdownStartsAt))
        : NaN;
    var cdLive = ui.showCountdown === true && !isNaN(cdEndsMs);

    var h = [];
    h.push(
      '<div class="vd-bundle' +
        (isVolumeTable ? " vd-bundle--volume-table" : "") +
        '">',
    );
    var sec = String(sectionHeading || "").trim();
    if (sec) {
      h.push('<h2 class="vd-section-title">' + esc(sec) + "</h2>");
    }
    h.push('<div class="vd-topbar">');
    h.push('<p class="vd-title">' + esc(ui.title) + "</p>");
    if (cdLive) {
      var noticeRaw = String(ui.countdownLabel || "").trim();
      var notice =
        noticeRaw
          .replace(/\s*%c\s*/gi, " ")
          .replace(/\s+/g, " ")
          .trim() || "Sale end in";
      h.push('<div class="vd-countdown">');
      h.push('<span class="vd-countdown-muted">' + esc(notice) + "</span> ");
      h.push('<span class="vd-countdown-badge" data-vd-cd></span>');
      h.push("</div>");
    }
    h.push("</div>");

    var selVariantId = vidRoot || firstAvailableVariantIdInList(variants) || "";
    if (!vdShowVariant) {
      var tvSel = readThemeProductFormVariantId();
      if (tvSel) {
        selVariantId = tvSel;
        root.setAttribute("data-variant-id", tvSel);
      }
    }

    if (isVolumeTable) {
      h.push(
        '<div class="vd-cards vd-cards--volume-table" role="radiogroup" aria-label="' +
          esc(ui.title) +
          '">',
      );
      h.push('<div class="vd-volume-table-scroll">');
      h.push('<div class="vd-volume-table-scroll-inner">');
      h.push('<table class="vd-volume-table"><thead><tr>');
      h.push("<th>" + esc("Quantity") + "</th>");
      h.push("<th>" + esc("Discount") + "</th>");
      h.push("<th>" + esc("Price per Item") + "</th>");
      h.push("</tr></thead><tbody>");
      for (var c = 0; c < tiers.length; c++) {
        var d = tiers[c];
        var uInit = tierUnitCents(currentUnitCents, d);
        h.push('<tr class="vd-volume-tier-row">');
        h.push("<td>" + esc(d.buyLabel) + "</td>");
        h.push(
          '<td data-vd-discount-cell>' +
            esc(tierVolumeTableDiscountLabel(d)) +
            "</td>",
        );
        h.push(
          '<td><span class="vd-price-strong" data-vd-main-price>' +
            fmtMoney(uInit, currency) +
            "</span></td>",
        );
        h.push("</tr>");
      }
      h.push("</tbody></table></div></div></div>");
    } else {
      h.push('<div class="vd-cards" role="radiogroup" aria-label="' + esc(ui.title) + '">');
      var perUnitCardsInit = ui.cardPriceShowsUnit === true;
      var hideCompareInit = ui.hideWidgetComparePrice === true;
      var badgePos = String(ui.badgePosition || "after_label");
      if (badgePos === "after_subtext_right") {
        badgePos = "after_subtext";
      }
      if (
        badgePos !== "after_label" &&
        badgePos !== "below_label" &&
        badgePos !== "after_subtext" &&
        badgePos !== "top_left" &&
        badgePos !== "top_center" &&
        badgePos !== "top_right" &&
        badgePos !== "price_column"
      ) {
        badgePos = "after_label";
      }
      var tierBadgeHtml = function (badgeText, rowClass) {
        if (!badgeText) return "";
        return (
          '<span class="vd-badge-pill' +
          (rowClass ? " " + rowClass : "") +
          '">' +
          esc(badgeText) +
          "</span>"
        );
      };
      for (var c2 = 0; c2 < tiers.length; c2++) {
        d = tiers[c2];
        var lt = lineTotals(currentUnitCents, d);
        var P = Math.max(0, lt.original - lt.discounted);
        var minQ = lt.minQty;
        var cardUnitCents = tierUnitCents(currentUnitCents, d);
        var badge = d.badge && String(d.badge).trim();
        var showStrikeInit = perUnitCardsInit
          ? P > 0 && cardUnitCents < currentUnitCents
          : minQ > 1 && P > 0;

        h.push(
          '<label class="vd-card' +
            (c2 === defaultIdx ? " vd-card--selected" : "") +
            (badge && isBadgeTopFloat(badgePos) ? " vd-card--badge-top-float" : "") +
            '">',
        );
        h.push(
          '<input class="vd-sr-only" type="radio" name="' +
            rn +
            '" value="' +
            d.minQty +
            '"' +
            (c2 === defaultIdx ? " checked" : "") +
            "/>",
        );
        if (badge && isBadgeTopFloat(badgePos)) {
          h.push(
            '<div class="vd-card__badge-top vd-card__badge-top--float ' +
              badgeTopFloatAlignClass(badgePos) +
              '">' +
              tierBadgeHtml(badge, "") +
              "</div>",
          );
        }
        h.push('<span class="vd-card__inner">');
        h.push('<span class="vd-card__row">');
        h.push('<span class="vd-row-main">');
        h.push('<span class="vd-radio-circle" aria-hidden="true"></span>');
        h.push('<span class="vd-card__text-stack">');
        h.push('<span class="vd-card__mid">');
        h.push('<span class="vd-buy">' + esc(d.buyLabel) + "</span>");
        if (badge && badgePos === "after_label") {
          h.push(tierBadgeHtml(badge, ""));
        }
        h.push("</span>");
        if (badge && badgePos === "below_label") {
          h.push(tierBadgeHtml(badge, "vd-badge-pill--row"));
        }
        var optSub =
          d.optionSubtext && String(d.optionSubtext).trim();
        if (optSub) {
          h.push(
            '<span class="vd-option-subtext vd-option-subtext--under">' +
              esc(optSub) +
              "</span>",
          );
        }
        if (badge && badgePos === "after_subtext") {
          h.push(tierBadgeHtml(badge, "vd-badge-pill--row"));
        }
        if (showStrikeInit) {
          h.push(
            '<span class="vd-you-save vd-you-save--under" data-vd-you-save>You save ' +
              fmtMoney(P, currency) +
              "</span>",
          );
        } else {
          h.push('<span class="vd-you-save vd-you-save--under" data-vd-you-save style="display:none"></span>');
        }
        h.push("</span></span>");
        h.push('<span class="vd-card__pricecol">');
        if (badge && badgePos === "price_column") {
          h.push(tierBadgeHtml(badge, "vd-badge-pill--pricecol"));
        }
        if (showStrikeInit && !hideCompareInit) {
          h.push(
            '<span class="vd-strike" data-vd-strike>' +
              fmtMoney(perUnitCardsInit ? currentUnitCents : lt.original, currency) +
              "</span>",
          );
        } else {
          h.push('<span class="vd-strike" data-vd-strike style="display:none"></span>');
        }
        h.push(
          '<span class="vd-price-strong" data-vd-main-price>' +
            fmtMoney(perUnitCardsInit ? cardUnitCents : lt.discounted, currency) +
            "</span>",
        );
        h.push("</span></span>");
        h.push(expandHtml(c2, selVariantId));
        h.push("</span></label>");
      }
      h.push("</div>");
    }

    var hideVolCta = isVolumeTable && ui.hideWidgetMainCta === true;
    if (!hideVolCta) {
      h.push(
        '<button type="button" class="vd-cta" data-vd-cta>' +
          esc(ui.ctaLabel) +
          "</button>",
      );
    }
    h.push(
      '<p class="vd-stock-alert" data-vd-stock-alert hidden tabindex="-1"></p>',
    );
    h.push(
      '<p class="vd-cart-qty-alert vd-cart-qty-alert--global" data-vd-cart-qty-alert-global hidden tabindex="-1"></p>',
    );
    h.push('<p class="vd-footnote">' + esc(ui.footnote) + "</p>");
    h.push("</div>");

    mountEl.innerHTML = h.join("");

    var cdEl = mountEl.querySelector("[data-vd-cd]");
    if (cdEl && cdLive) {
      var cdWrap = cdEl.closest(".vd-countdown");
      var tickCd = function () {
        var now = Date.now();
        if (!isNaN(cdStartsMs) && now < cdStartsMs) {
          if (cdWrap) cdWrap.style.display = "none";
          return;
        }
        if (cdWrap) cdWrap.style.display = "";
        var left = Math.max(0, Math.floor((cdEndsMs - now) / 1000));
        cdEl.textContent = formatCountdown(left, ui.countdownTimeUnit);
      };
      tickCd();
      var iv = setInterval(tickCd, 1000);
      root.setAttribute("data-vd-cd-iv", String(iv));
    }

    var initVid = selVariantId;
    currentUnitCents = readPriceForVariant(initVid);
    syncAllVariantSelects(initVid);
    updateAllPrices();
    stateQty = Math.max(1, tiers[defaultIdx].minQty | 0);
    updateQtyDisplay();
    syncSelectedCard();
    updatePurchaseControlsAvailability();

    mountEl.addEventListener("input", function (ev) {
      var t = ev.target;
      if (
        !t ||
        !t.getAttribute ||
        t.getAttribute("data-vd-qty-display") == null ||
        t.tagName !== "INPUT"
      ) {
        return;
      }
      var maxLen = String(VD_MAX_LINE_QTY).length;
      var cleaned = String(t.value || "")
        .replace(/\D/g, "")
        .slice(0, maxLen);
      if (t.value !== cleaned) t.value = cleaned;
    });

    mountEl.addEventListener("change", function (ev) {
      var t = ev.target;
      if (
        t &&
        t.getAttribute &&
        t.getAttribute("data-vd-qty-display") != null &&
        t.tagName === "INPUT"
      ) {
        applyQtyFromInput(t);
        return;
      }
      if (
        vdShowVariant &&
        t &&
        t.classList &&
        t.classList.contains("vd-variant-select")
      ) {
        var v = t.value;
        currentUnitCents = readPriceForVariant(v);
        syncAllVariantSelects(v);
        updateAllPrices();
        updateQtyDisplay();
        syncFormVariant(v);
        root.setAttribute("data-variant-id", String(v));
        updatePurchaseControlsAvailability();
        return;
      }
      if (t && t.name === rn && !isVolumeTable) {
        /* Snap qty to the newly selected tier's minimum so a high tier (e.g. min 20)
           does not stick when switching to a lower tier (e.g. min 1). */
        stateQty = getTierMinQty();
        updateQtyDisplay();
        syncSelectedCard();
      }
    });

    mountEl.addEventListener("focusout", function (ev) {
      var t = ev.target;
      if (
        !t ||
        !t.getAttribute ||
        t.getAttribute("data-vd-qty-display") == null ||
        t.tagName !== "INPUT"
      ) {
        return;
      }
      applyQtyFromInput(t);
    });

    mountEl.addEventListener("keydown", function (ev) {
      var t = ev.target;
      if (
        !t ||
        !t.getAttribute ||
        t.getAttribute("data-vd-qty-display") == null ||
        t.tagName !== "INPUT"
      ) {
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        t.blur();
      }
    });

    mountEl.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vd-qty-dec],[data-vd-qty-inc],[data-vd-tier-add]") : null;
      if (!btn) return;
      if (btn.hasAttribute("data-vd-qty-dec")) {
        ev.preventDefault();
        var mq = getTierMinQty();
        stateQty = Math.max(mq, stateQty - 1);
        updateQtyDisplay();
        return;
      }
      if (btn.hasAttribute("data-vd-qty-inc")) {
        ev.preventDefault();
        stateQty = Math.min(VD_MAX_LINE_QTY, stateQty + 1);
        updateQtyDisplay();
        return;
      }
      if (btn.hasAttribute("data-vd-tier-add")) {
        ev.preventDefault();
        clampQty();
        syncQtyToForm();
        var vidAdd = resolveActiveVariantIdForCart();
        if (!vidAdd) {
          scrollToAtc();
          return;
        }
        if (!isVariantAvailableForCart(vidAdd)) {
          showVdOutOfStockMessage();
          return;
        }
        syncFormVariant(vidAdd);
        root.setAttribute("data-variant-id", String(vidAdd));
        var qtyAdd = stateQty;
        btn.disabled = true;
        addVariantToCart(vidAdd, qtyAdd)
          .then(function () {
            clearVdCartQtyAlert();
            return completeAfterCartAdd(ui);
          })
          .catch(function (err) {
            var em = err && err.message ? String(err.message) : "";
            if (isVdCartMaxQuantityErrorMessage(em)) {
              showVdCartMaxQtyMessageAndGoToCart();
              return;
            }
            scrollToAtc();
          })
          .then(function () {
            btn.disabled = false;
          });
      }
    });

    var cta = mountEl.querySelector("[data-vd-cta]");
    if (cta) {
      cta.addEventListener("click", function () {
        clampQty();
        syncQtyToForm();
        var vidC = resolveActiveVariantIdForCart();
        if (!vidC) {
          scrollToAtc();
          return;
        }
        if (!isVariantAvailableForCart(vidC)) {
          showVdOutOfStockMessage();
          return;
        }
        syncFormVariant(vidC);
        root.setAttribute("data-variant-id", String(vidC));
        cta.disabled = true;
        addVariantToCart(vidC, stateQty)
          .then(function () {
            clearVdCartQtyAlert();
            return completeAfterCartAdd(ui);
          })
          .catch(function (err) {
            var em = err && err.message ? String(err.message) : "";
            if (isVdCartMaxQuantityErrorMessage(em)) {
              showVdCartMaxQtyMessageAndGoToCart();
              return;
            }
            scrollToAtc();
          })
          .then(function () {
            cta.disabled = false;
          });
      });
    }

    if (!vdShowVariant && shouldShowVariantPicker(variants)) {
      document.addEventListener(
        "change",
        function vdThemeVariantFollow(ev) {
          var t = ev.target;
          if (!t || !t.name || String(t.name) !== "id") return;
          var form = t.closest && t.closest('form[action*="/cart/add"]');
          if (!form || form.closest(".vd-storefront-root")) return;
          var v = String(t.value || "");
          if (!v) return;
          currentUnitCents = readPriceForVariant(v);
          root.setAttribute("data-variant-id", v);
          updateAllPrices();
          updateQtyDisplay();
          updatePurchaseControlsAvailability();
        },
        true,
      );
    }

    root.style.display = "";
    mountEl.hidden = false;
    root.setAttribute("data-vd-inited", "1");
    window.VolumeDiscount = window.VolumeDiscount || {};
    window.VolumeDiscount.embed = window.VolumeDiscount.embed || {};
    window.VolumeDiscount.embed.version = "1.17.22";

    /**
     * Remove the body app-embed fallback only after a section "Quantity breaks" widget
     * has successfully mounted. Removing earlier (e.g. at scan start) hid the embed
     * when the section block existed but had no campaign for this product.
     */
    if (root.getAttribute("data-vd-embed-fallback") !== "true") {
      document
        .querySelectorAll(".vd-storefront-root[data-vd-embed-fallback]")
        .forEach(function (el) {
          el.remove();
        });
    }
  }

  function runWidget(root) {
    if (root.getAttribute("data-vd-inited") === "1") return;
    var configId = root.getAttribute("data-config-id");
    var mount = root.querySelector("[data-vd-mount]");
    var scriptEl = configId ? document.getElementById(configId) : null;
    if (!mount) return;

    var productId = root.getAttribute("data-product-id");
    if (!productId) {
      hydrateRootProductDataFromJson(root).then(function (ok) {
        if (ok) runWidget(root);
        else mount.hidden = true;
      });
      return;
    }

    var embedFallback = root.getAttribute("data-vd-embed-fallback") === "true";
    if (embedFallback) {
      var form = document.querySelector('form[action*="/cart/add"]');
      if (form && form.parentNode && root.parentNode !== form.parentNode) {
        form.parentNode.insertBefore(root, form);
      }
    }
    var variantId = root.getAttribute("data-variant-id");
    var productGid = root.getAttribute("data-product-gid");
    var variantGid = root.getAttribute("data-variant-gid");
    var unitCents = parseInt(String(root.getAttribute("data-unit-price-cents") || "0"), 10);
    var currency = root.getAttribute("data-currency") || "USD";
    var heading =
      root.getAttribute("data-heading") || "Quantity breaks";
    var sectionHeading = root.getAttribute("data-section-heading");
    if (sectionHeading == null) sectionHeading = "";
    var variants = parseVariantsFromRoot(root);
    var designMode = root.getAttribute("data-design-mode") === "true";

    if (!productId) {
      mount.hidden = true;
      return;
    }
    if (!unitCents || unitCents < 1) {
      if (designMode) unitCents = 2500;
      else {
        mount.hidden = true;
        return;
      }
    }

    function applyConfig(cfg) {
      var camp = pickCampaign(cfg, productId, variantId, productGid, variantGid);
      if (!camp || !camp.tiers || !camp.tiers.length) {
        root.style.display = "none";
        return;
      }
      mountBundle(
        root,
        mount,
        camp,
        String(configId || "vd"),
        unitCents,
        currency,
        heading,
        sectionHeading,
        variants,
      );
    }

    var inline = sanitizeWidgetConfig(parseInline(scriptEl), designMode);

    var matched = pickCampaign(
      inline,
      productId,
      variantId,
      productGid,
      variantGid,
    );

    if (designMode && (!matched || !matched.tiers || !matched.tiers.length)) {
      matched = {
        id: "_preview",
        campaignName: "Preview",
        productScope: "all",
        tiers: [
          { minQty: 1, buyLabel: "Buy 1", badge: "Most Popular ⚡", activeByDefault: true, percent: 0 },
          { minQty: 3, buyLabel: "Buy 3+", badge: null, activeByDefault: false, percent: 10 },
          { minQty: 5, buyLabel: "Buy 5+", badge: null, activeByDefault: false, percent: 15 }
        ],
        widgetDisplay: WD_DEFAULT
      };
    }

    if (matched && matched.tiers && matched.tiers.length) {
      mountBundle(
        root,
        mount,
        matched,
        String(configId || "vd"),
        unitCents,
        currency,
        heading,
        sectionHeading,
        variants,
      );
      return;
    }

    var usePerProductApi =
      inline.mode === "per_product" ||
      !Array.isArray(inline.campaigns) ||
      inline.campaigns.length === 0;

    function finishFetch(remote) {
      if (!root.isConnected) return;
      if (root.getAttribute("data-vd-inited") === "1") return;
      var cfg = sanitizeWidgetConfig(
        remote || { version: 1, campaigns: [] },
        designMode,
      );
      if (scriptEl && cfg && cfg.campaigns) {
        try {
          scriptEl.textContent = JSON.stringify(cfg);
        } catch (e) {
          void e;
        }
      }
      applyConfig(cfg);
    }

    if (usePerProductApi) {
      fetchConfig(productId, variantId).then(finishFetch);
      return;
    }

    fetchConfig(productId, variantId).then(finishFetch);
  }

  function scan() {
    document.querySelectorAll(".vd-storefront-root").forEach(function (el) {
      runWidget(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
  document.addEventListener("shopify:section:load", scan);
})();

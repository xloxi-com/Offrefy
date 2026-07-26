"use strict";
(function () {
  "use strict";
  var PROXY = "/apps/volume-discount/widget-config";
  var ANALYTICS_PROXY = "/apps/volume-discount/analytics";
  var OFFREFY_LINE_PROP = "_offrefy";
  var OFFREFY_CAMPAIGN_PROP = "_offrefy_campaign";
  var OFFREFY_PRODUCT_PROP = "_offrefy_product";
  var OFFREFY_CART_FLAG_ATTR = "offrefy";
  var OFFREFY_CART_CAMPAIGN_ATTR = "offrefy_campaign";
  var OFFREFY_CART_PRODUCT_ATTR = "offrefy_product";
  /** @type {Set<string>} */
  var trackedImpressions = new Set();
  /** @type {Map<string, Promise<object>>} */
  var fetchPromiseByKey = new Map();
  /** Per-product dedupe: variant id rarely changes widget tiers for the same product. */
  /** @type {Map<string, Promise<object>>} */
  var fetchPromiseByProductId = new Map();
  /** Upper bound for widget qty + /cart/add.js line quantity (Shopify allows large lines; caps abuse). */
  var VD_MAX_LINE_QTY = 9999;

  function fetchConfigKey(productId, variantId) {
    var rev =
      typeof window.__vdConfigRev !== "undefined" && window.__vdConfigRev != null
        ? String(window.__vdConfigRev)
        : "";
    return rev + "|" + String(productId || "") + "|" + String(variantId || "");
  }

  function withShopQuery(url) {
    var shopDomain =
      window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";
    if (!shopDomain) return url;
    return (
      url +
      (url.indexOf("?") === -1 ? "?" : "&") +
      "shop=" +
      encodeURIComponent(shopDomain)
    );
  }

  function withRevQuery(url) {
    var rev =
      typeof window.__vdConfigRev !== "undefined" && window.__vdConfigRev != null
        ? String(window.__vdConfigRev)
        : "";
    /* Always bust HTTP caches with a coarse bucket so admin edits show on next page load. */
    var bucket = String(Math.floor(Date.now() / 5000));
    var out =
      url +
      (url.indexOf("?") === -1 ? "?" : "&") +
      "_=" +
      encodeURIComponent(bucket);
    if (!rev) return out;
    return out + "&rev=" + encodeURIComponent(rev);
  }

  function widgetConfigQuery(productId, variantId) {
    if (!productId) return "";
    return (
      "?product_id=" +
      encodeURIComponent(String(productId)) +
      (variantId
        ? "&variant_id=" + encodeURIComponent(String(variantId))
        : "")
    );
  }

  /** Prefer app-proxy first (signed shop session) then direct app host (CORS). */
  function widgetConfigCandidateUrls(productId, variantId) {
    var q = widgetConfigQuery(productId, variantId);
    var root = "/";
    try {
      if (
        window.Shopify &&
        window.Shopify.routes &&
        typeof window.Shopify.routes.root === "string"
      ) {
        root = window.Shopify.routes.root;
        if (root.slice(-1) !== "/") root += "/";
      }
    } catch (e) {
      void e;
    }
    var urls = [];
    urls.push(
      withRevQuery(
        withShopQuery(root + "apps/volume-discount/widget-config" + q),
      ),
    );
    if (root !== "/") {
      urls.push(withRevQuery(withShopQuery(PROXY + q)));
    }
    var abs =
      typeof window.__vdAppOrigin === "string"
        ? String(window.__vdAppOrigin).replace(/\/$/, "")
        : "";
    if (abs) {
      urls.push(withRevQuery(withShopQuery(abs + "/widget-config" + q)));
    }
    return urls;
  }

  function parseWidgetConfigResponse(res) {
    if (!res || !res.ok) return Promise.resolve(null);
    var ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct.indexOf("json") === -1) return Promise.resolve(null);
    return res.json().catch(function () {
      return null;
    });
  }

  function isUsableWidgetConfig(body) {
    var ok = !!(
      body &&
      Array.isArray(body.campaigns) &&
      body.campaigns.length > 0
    );
    if (ok) rememberMaxDiscountProducts(body);
    return ok;
  }

  /** Resolve first successful config among parallel candidates. */
  function raceUsableConfigs(promises) {
    return new Promise(function (resolve) {
      var left = promises.length;
      var settled = false;
      if (!left) {
        resolve({ version: 1, campaigns: [] });
        return;
      }
      for (var i = 0; i < promises.length; i++) {
        promises[i].then(
          function (body) {
            if (settled) return;
            if (isUsableWidgetConfig(body)) {
              settled = true;
              resolve(body);
              return;
            }
            left -= 1;
            if (!left) resolve({ version: 1, campaigns: [] });
          },
          function () {
            if (settled) return;
            left -= 1;
            if (!left) resolve({ version: 1, campaigns: [] });
          },
        );
      }
    });
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

    var prefetchKey = window.__vdConfigPrefetchKey;
    var prefetchPromise =
      prefetchKey &&
      prefetchKey === key &&
      window.__vdConfigPrefetch &&
      typeof window.__vdConfigPrefetch.then === "function"
        ? window.__vdConfigPrefetch.then(function (body) {
            return isUsableWidgetConfig(body) ? body : null;
          })
        : Promise.resolve(null);

    var candidates = widgetConfigCandidateUrls(productId, variantId);
    var networkPromises = candidates.map(function (url) {
      var cross = String(url).indexOf("://") !== -1;
      return fetch(url, {
        credentials: cross ? "omit" : "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(parseWidgetConfigResponse);
    });

    var promise = raceUsableConfigs(
      [prefetchPromise].concat(networkPromises),
    ).then(function (body) {
      if (isUsableWidgetConfig(body)) {
        return body;
      }
      fetchPromiseByKey.delete(key);
      if (pid) fetchPromiseByProductId.delete(pid);
      return { version: 1, campaigns: [] };
    });

    fetchPromiseByKey.set(key, promise);
    if (pid) fetchPromiseByProductId.set(pid, promise);
    return promise;
  }

  function offrefyCartProperties(attribution) {
    if (!attribution || !attribution.campaignId) return null;
    var props = {};
    props[OFFREFY_LINE_PROP] = "1";
    props[OFFREFY_CAMPAIGN_PROP] = String(attribution.campaignId);
    if (attribution.productId) {
      props[OFFREFY_PRODUCT_PROP] = String(attribution.productId);
    }
    return props;
  }

  function applyOffrefyPropertiesToForm(form, attribution) {
    var props = offrefyCartProperties(attribution);
    if (!form || !props) return;
    var existing = form.querySelectorAll("[data-vd-offrefy-prop]");
    for (var ei = 0; ei < existing.length; ei++) {
      existing[ei].remove();
    }
    for (var key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "properties[" + key + "]";
      input.value = props[key];
      input.setAttribute("data-vd-offrefy-prop", "1");
      form.appendChild(input);
    }
  }

  function syncOffrefyCartAttributes(attribution) {
    if (!attribution || !attribution.campaignId) return Promise.resolve();
    var attrs = {};
    attrs[OFFREFY_CART_FLAG_ATTR] = "1";
    attrs[OFFREFY_CART_CAMPAIGN_ATTR] = String(attribution.campaignId);
    if (attribution.productId) {
      attrs[OFFREFY_CART_PRODUCT_ATTR] = String(attribution.productId);
    }
    return fetch("/cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ attributes: attrs }),
    }).catch(function () {});
  }

  function trackAnalyticsEvent(payload) {
    try {
      var shopDomain =
        window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";
      var url = ANALYTICS_PROXY;
      if (shopDomain) {
        url +=
          (url.indexOf("?") === -1 ? "?" : "&") +
          "shop=" +
          encodeURIComponent(shopDomain);
      }
      var body = JSON.stringify({
        events: [payload],
      });
      fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body,
        keepalive: true,
      }).catch(function () {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            url,
            new Blob([body], { type: "application/json" }),
          );
        }
      });
    } catch (e) {
      void e;
    }
  }

  function trackImpression(campaign, productId) {
    if (!campaign || !campaign.id || campaign.id === "_preview") return;
    var key = String(campaign.id) + "|" + String(productId || "");
    if (trackedImpressions.has(key)) return;
    trackedImpressions.add(key);
    trackAnalyticsEvent({
      type: "impression",
      campaignId: String(campaign.id),
      productId: productId ? String(productId) : undefined,
    });
  }

  function trackAddToCart(campaign, productId, variantId, quantity, revenueCents) {
    if (!campaign || !campaign.id || campaign.id === "_preview") return;
    trackAnalyticsEvent({
      type: "add_to_cart",
      campaignId: String(campaign.id),
      productId: productId ? String(productId) : undefined,
      variantId: variantId ? String(variantId) : undefined,
      quantity: Math.max(1, quantity | 0),
      revenueCents: Math.max(0, revenueCents | 0),
    });
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
  function copyWidgetConfigMeta(cfg, result) {
    if (cfg && cfg.translations && typeof cfg.translations === "object") {
      result.translations = cfg.translations;
    }
    if (cfg && cfg.mode) {
      result.mode = cfg.mode;
    }
    if (
      cfg &&
      typeof cfg.maxDiscountProducts === "number" &&
      cfg.maxDiscountProducts > 0
    ) {
      result.maxDiscountProducts = cfg.maxDiscountProducts;
    }
    return result;
  }

  function isTranslationLocaleMap(obj) {
    if (!obj || typeof obj !== "object") return false;
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var entry = obj[k];
      if (entry && typeof entry === "object" && entry.transHeading != null) {
        return true;
      }
    }
    return false;
  }

  function resolveWidgetTranslations(root, campaign) {
    if (
      campaign &&
      campaign.translations &&
      isTranslationLocaleMap(campaign.translations)
    ) {
      return campaign.translations;
    }
    if (root) {
      var configId = root.getAttribute("data-config-id");
      if (configId) {
        var scriptEl = document.getElementById(configId);
        var cfg = parseInline(scriptEl);
        if (cfg && cfg.translations) {
          return cfg.translations;
        }
      }
    }
    return (campaign && campaign.translations) || {};
  }

  function sanitizeWidgetConfig(cfg, designMode) {
    if (!cfg || typeof cfg !== "object") return { version: 1, campaigns: [] };
    rememberMaxDiscountProducts(cfg);
    var list = Array.isArray(cfg.campaigns) ? cfg.campaigns : [];
    if (designMode) {
      return copyWidgetConfigMeta(cfg, { version: cfg.version || 1, campaigns: list });
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || typeof c !== "object") continue;
      if (String(c.id || "") === "_preview") continue;
      out.push(c);
    }
    return copyWidgetConfigMeta(cfg, { version: cfg.version || 1, campaigns: out });
  }

  function productMatch(campaign, productId, variantId, productGid, variantGid) {
    if (campaign.productScope === "all") return true;
    var p = String(productId || "");
    var v = String(variantId || "");
    var og = productGid ? String(productGid) : "";
    var vg = variantGid ? String(variantGid) : "";
    var ids = campaign.productIds || [];
    function idHit(s) {
      s = String(s || "");
      if (!s) return false;
      if (og && s === og) return true;
      if (vg && s === vg) return true;
      if (p && s === p) return true;
      if (v && s === v) return true;
      if (p && s.indexOf("/Product/" + p) !== -1) return true;
      if (v && (s.indexOf("/Variant/" + v) !== -1 || s.indexOf("/ProductVariant/" + v) !== -1)) {
        return true;
      }
      return false;
    }
    for (var i = 0; i < ids.length; i++) {
      if (idHit(ids[i])) return true;
    }
    var groups = campaign.collectionGroups;
    if (groups && groups.length) {
      for (var gi = 0; gi < groups.length; gi++) {
        var gids = (groups[gi] && groups[gi].productIds) || [];
        for (var gj = 0; gj < gids.length; gj++) {
          if (idHit(gids[gj])) return true;
        }
      }
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

  function localizeBuyLabel(label, buyPrefix) {
    var prefix = String(buyPrefix || "Buy").trim() || "Buy";
    var text = String(label || "").trim();
    if (!text) return text;
    if (/^buy\b/i.test(text)) {
      return text.replace(/^buy\b/i, prefix);
    }
    return text;
  }

  function buyLabelsForQuantityTiersLocalized(buyNums, buyPrefix) {
    var prefix = String(buyPrefix || "Buy").trim() || "Buy";
    var n = buyNums.length;
    if (n === 0) return [];
    return buyNums.map(function (b, i) {
      if (n === 1) return b <= 1 ? prefix + " 1" : prefix + " " + b + "+";
      if (i === 0) return b === 1 ? prefix + " 1" : prefix + " " + b;
      if (i === n - 1) return prefix + " " + b + "+";
      var next = buyNums[i + 1];
      if (next - b === 1) return prefix + " " + b;
      return prefix + " " + b + "\u2013" + (next - 1);
    });
  }

  function localizedTierBuyLabel(storedLabel, tierIndex, tiers, buyPrefix) {
    var nums = tiers.map(function (t) {
      return t.minQty | 0;
    });
    var englishLabels = buyLabelsForQuantityTiersLocalized(nums, "Buy");
    var localizedLabels = buyLabelsForQuantityTiersLocalized(nums, buyPrefix);
    var stored = String(storedLabel || "").trim();
    var englishAuto = englishLabels[tierIndex] || "";
    var localizedAuto = localizedLabels[tierIndex] || stored;
    if (!stored || stored.toLowerCase() === englishAuto.toLowerCase()) {
      return localizedAuto;
    }
    return localizeBuyLabel(stored, buyPrefix);
  }

  var STOREFRONT_LANG_FALLBACKS = {
    en: { transBuy: "Buy", transYouSave: "You save", transAdd: "Add" },
    fr: { transBuy: "Achetez", transYouSave: "Vous économisez", transAdd: "Ajouter" },
    es: { transBuy: "Compre", transYouSave: "Ahorras", transAdd: "Añadir" },
    de: { transBuy: "Kaufen", transYouSave: "Sie sparen", transAdd: "Hinzufügen" },
    ta: { transBuy: "வாங்குங்கள்", transYouSave: "நீங்கள் சேமிக்கிறீர்கள்", transAdd: "சேர்" },
    nl: { transBuy: "Koop", transYouSave: "Je bespaart", transAdd: "Toevoegen" },
  };

  var CART_BADGE_JS_FALLBACKS = {
    en: { discount: "{{ discount }} OFF", qty: "(qty {{ qty }})" },
    es: { discount: "{{ discount }} DE DESCUENTO", qty: "(cant. {{ qty }})" },
    fr: { discount: "{{ discount }} DE RÉDUCTION", qty: "(qté {{ qty }})" },
    de: { discount: "{{ discount }} RABATT", qty: "(Menge {{ qty }})" },
    ta: { discount: "{{ discount }} தள்ளுபடி", qty: "(அளவு {{ qty }})" },
    nl: { discount: "{{ discount }} KORTING", qty: "(aantal {{ qty }})" },
  };

  function rememberStorefrontTranslations(transMap) {
    if (transMap && typeof transMap === "object" && !Array.isArray(transMap)) {
      window.__vdStorefrontTranslations = transMap;
    }
  }

  function isEnglishCartBadgeDiscountTemplate(template) {
    var t = String(template || "").trim().toLowerCase();
    return (
      t === "{{ discount }} off" ||
      t === "{{discount}} off" ||
      t.indexOf(" off") !== -1
    );
  }

  function isEnglishCartBadgeQtyTemplate(template) {
    var t = String(template || "").trim().toLowerCase();
    return t === "(qty {{ qty }})" || t.indexOf("(qty ") !== -1;
  }

  function resolveCartBadgeTemplates() {
    var locale = resolveStorefrontLocale(null) || "en";
    var fromWindow = window.__vdCartBadgeTemplates;
    if (
      fromWindow &&
      fromWindow.discount &&
      fromWindow.locale === locale &&
      (locale === "en" || !isEnglishCartBadgeDiscountTemplate(fromWindow.discount))
    ) {
      return {
        discount: String(fromWindow.discount),
        qty: String(fromWindow.qty || "(qty {{ qty }})"),
      };
    }

    var transMap = window.__vdStorefrontTranslations || {};
    var entry = transMap[locale] || {};
    var preset = CART_BADGE_JS_FALLBACKS[locale];
    var discount =
      entry.transCartDiscount && String(entry.transCartDiscount).trim()
        ? String(entry.transCartDiscount).trim()
        : preset && preset.discount
          ? preset.discount
          : "{{ discount }} OFF";
    var qty =
      entry.transCartDiscountQty && String(entry.transCartDiscountQty).trim()
        ? String(entry.transCartDiscountQty).trim()
        : preset && preset.qty
          ? preset.qty
          : "(qty {{ qty }})";

    if (locale !== "en" && isEnglishCartBadgeDiscountTemplate(discount)) {
      if (preset && preset.discount) {
        discount = preset.discount;
      } else {
        var transDiscount =
          entry.transDiscount && String(entry.transDiscount).trim();
        if (
          transDiscount &&
          transDiscount.toLowerCase() !== "discount"
        ) {
          discount = "{{ discount }} " + transDiscount;
        }
      }
    }
    if (locale !== "en" && isEnglishCartBadgeQtyTemplate(qty)) {
      if (preset && preset.qty) {
        qty = preset.qty;
      } else {
        var transQty = entry.transQty && String(entry.transQty).trim();
        if (transQty && transQty.toLowerCase() !== "qty") {
          qty = "(" + transQty + " {{ qty }})";
        }
      }
    }

    return { discount: discount, qty: qty };
  }

  function refreshCartBadgeTemplatesForLocale() {
    var locale = resolveStorefrontLocale(null) || "en";
    var templates = resolveCartBadgeTemplates();
    window.__vdCartBadgeTemplates = {
      locale: locale,
      discount: templates.discount,
      qty: templates.qty,
    };
    return templates;
  }

  function formatLocalizedCartBadgeLabel(percent, qty) {
    var templates = resolveCartBadgeTemplates();
    var core = String(templates.discount || "{{ discount }} OFF").replace(
      /\{\{\s*discount\s*\}\}/gi,
      String(percent) + "%",
    );
    var n = parseInt(String(qty), 10);
    if (!Number.isFinite(n) || n <= 0) return core;
    var suffix = String(templates.qty || "(qty {{ qty }})").replace(
      /\{\{\s*qty\s*\}\}/gi,
      String(n),
    );
    return core + " " + suffix;
  }

  function looksLikeVolumeDiscountBadge(text) {
    var s = String(text || "").trim();
    // Only rewrite legacy auto labels from the Discount Function
    // (e.g. "25% OFF" / "25% OFF (qty 10)"). Never touch custom Display names.
    if (s.length < 3 || s.length > 80) return false;
    return /^\d+(?:\.\d+)?%\s*OFF(?:\s*\(\s*qty\s+\d+\s*\))?$/i.test(s);
  }

  function parseVolumeDiscountBadgeText(text) {
    var s = String(text || "").trim();
    if (!looksLikeVolumeDiscountBadge(s)) return null;
    var pctMatch = s.match(/^(\d+(?:\.\d+)?)\s*%/);
    if (!pctMatch) return null;
    var qty = 0;
    var qtyMatch = s.match(/\(\s*[^)]*?(\d+)\s*\)\s*$/);
    if (qtyMatch) qty = parseInt(qtyMatch[1], 10);
    return { percent: pctMatch[1], qty: qty };
  }

  function patchCartDrawerDiscountLabels() {
    refreshCartBadgeTemplatesForLocale();

    var drawer =
      document.querySelector("cart-drawer") ||
      document.getElementById("CartDrawer") ||
      document.querySelector("[id*='cart-drawer']");
    if (!drawer) return;

    var walker = document.createTreeWalker(drawer, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var text = String(node.textContent || "").trim();
      if (!text) continue;
      var parsed = parseVolumeDiscountBadgeText(text);
      if (!parsed) continue;
      var next = formatLocalizedCartBadgeLabel(parsed.percent, parsed.qty);
      if (next !== text) node.textContent = next;
    }
  }

  var vdCartBadgePatchScheduled = false;
  function scheduleCartDrawerDiscountLabelPatch() {
    if (vdCartBadgePatchScheduled) return;
    vdCartBadgePatchScheduled = true;
    requestAnimationFrame(function () {
      vdCartBadgePatchScheduled = false;
      patchCartDrawerDiscountLabels();
    });
  }

  var vdLockedSyncFromEventsTimer = 0;
  function scheduleLockedProductsSyncFromCartEvent() {
    /* Interceptor already owns locked sync after fetch mutations — avoid triple cart.js. */
    if (vdCartAttrSyncBusy || vdLockedSyncInFlight) return;
    if (vdLockedSyncFromEventsTimer) return;
    vdLockedSyncFromEventsTimer = setTimeout(function () {
      vdLockedSyncFromEventsTimer = 0;
      if (vdCartAttrSyncBusy || vdLockedSyncInFlight) return;
      syncCartLockedProductsAttribute(null);
    }, 120);
  }

  function bindCartDrawerDiscountLabelPatching() {
    if (window.__vdCartBadgePatchBound) return;
    window.__vdCartBadgePatchBound = true;
    ["cart:updated", "cart:change", "cart:refresh"].forEach(function (evt) {
      document.documentElement.addEventListener(evt, scheduleCartDrawerDiscountLabelPatch);
    });
    /* One debounced locked sync fallback — never re-dispatch cart events (avoids feedback loops). */
    document.documentElement.addEventListener(
      "cart:updated",
      scheduleLockedProductsSyncFromCartEvent,
    );
    if (typeof MutationObserver !== "undefined") {
      var drawerObserver = null;
      var openWatchObserver = null;
      var observeDrawer = function () {
        var drawer = document.querySelector("cart-drawer");
        if (!drawer) return;
        if (drawerObserver) {
          try {
            drawerObserver.disconnect();
          } catch (e) {
            void e;
          }
        }
        drawerObserver = new MutationObserver(function () {
          scheduleCartDrawerDiscountLabelPatch();
        });
        drawerObserver.observe(drawer, { childList: true, subtree: true });
        if (drawer.getAttribute("data-vd-open-watch") === "1") return;
        drawer.setAttribute("data-vd-open-watch", "1");
        if (openWatchObserver) {
          try {
            openWatchObserver.disconnect();
          } catch (e2) {
            void e2;
          }
        }
        openWatchObserver = new MutationObserver(function () {
          var isOpen =
            drawer.hasAttribute("open") ||
            drawer.classList.contains("is-open") ||
            drawer.classList.contains("active");
          if (!isOpen) return;
          scheduleCartDrawerDiscountLabelPatch();
          setTimeout(scheduleCartDrawerDiscountLabelPatch, 120);
        });
        openWatchObserver.observe(drawer, {
          attributes: true,
          attributeFilter: ["open", "class"],
        });
      };
      observeDrawer();
      document.addEventListener("shopify:section:load", observeDrawer);
    }
  }

  var vdLastKnownStorefrontLocale = "";

  function handleStorefrontLocaleChange() {
    var next = resolveStorefrontLocale(null) || "en";
    if (next === vdLastKnownStorefrontLocale) {
      return;
    }
    vdLastKnownStorefrontLocale = next;
    window.__vdStorefrontLocale = next;
    vdLastSyncedCartLocale = "";
    refreshCartBadgeTemplatesForLocale();
    syncCartLocaleAttribute(true)
      .then(function () {
        return refreshCartDrawerForLocaleChange();
      })
      .then(function () {
        scheduleCartDrawerDiscountLabelPatch();
        setTimeout(scheduleCartDrawerDiscountLabelPatch, 120);
        setTimeout(scheduleCartDrawerDiscountLabelPatch, 450);
      });
  }

  function bindStorefrontLocaleWatcher() {
    if (window.__vdLocaleWatchBound) return;
    window.__vdLocaleWatchBound = true;
    vdLastKnownStorefrontLocale = resolveStorefrontLocale(null) || "en";

    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function () {
        handleStorefrontLocaleChange();
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }

    window.addEventListener("popstate", handleStorefrontLocaleChange);
    window.addEventListener("pageshow", handleStorefrontLocaleChange);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) handleStorefrontLocaleChange();
    });

    document.addEventListener(
      "submit",
      function (ev) {
        var form = ev.target;
        if (!form || !form.getAttribute) return;
        var action = String(form.getAttribute("action") || "");
        if (
          action.indexOf("/localization") !== -1 ||
          form.id === "localization_form" ||
          form.classList.contains("localization-form")
        ) {
          setTimeout(handleStorefrontLocaleChange, 50);
          setTimeout(handleStorefrontLocaleChange, 600);
          setTimeout(refreshCartDrawerForLocaleChange, 800);
        }
      },
      true,
    );

    document.addEventListener(
      "click",
      function (ev) {
        var link =
          ev.target && ev.target.closest
            ? ev.target.closest(
                'a[href], button[data-locale], [data-value], [data-language], .disclosure__link',
              )
            : null;
        if (!link) return;
        var href = String(link.getAttribute("href") || "");
        if (href) {
          var pathOnly = href.replace(/^https?:\/\/[^/]+/i, "");
          var pathLocale = localeCodeFromPathPrefix(pathOnly);
          if (pathLocale) {
            window.__vdStorefrontLocale = pathLocale;
            vdLastKnownStorefrontLocale = "";
            setTimeout(handleStorefrontLocaleChange, 0);
            setTimeout(handleStorefrontLocaleChange, 400);
            setTimeout(refreshCartDrawerForLocaleChange, 700);
          }
        }
        var dataLocale =
          link.getAttribute("data-locale") ||
          link.getAttribute("data-language") ||
          link.getAttribute("data-value");
        if (dataLocale) {
          window.__vdStorefrontLocale = normalizeLocaleCode(dataLocale);
          vdLastKnownStorefrontLocale = "";
          setTimeout(handleStorefrontLocaleChange, 0);
          setTimeout(refreshCartDrawerForLocaleChange, 500);
        }
      },
      true,
    );
  }

  function tierStringsFromRoot(root) {
    if (!root || !root.getAttribute) return {};
    return {
      transBuy: root.getAttribute("data-vd-trans-buy") || "",
      transYouSave: root.getAttribute("data-vd-trans-you-save") || "",
      transAdd: root.getAttribute("data-vd-trans-add") || "",
    };
  }

  function resolveLangTranslation(locale, transMap, root) {
    var base = (transMap && transMap[locale]) || {};
    var fromRoot = tierStringsFromRoot(root);
    var fallback = STOREFRONT_LANG_FALLBACKS[locale] || STOREFRONT_LANG_FALLBACKS.en;
    function pick(field, defaultValue) {
      var value = base[field];
      if (value != null && String(value).trim() !== "") {
        return String(value).trim();
      }
      var rootValue = fromRoot[field];
      if (rootValue != null && String(rootValue).trim() !== "") {
        return String(rootValue).trim();
      }
      var fb = fallback[field];
      if (fb != null && String(fb).trim() !== "") return String(fb).trim();
      return defaultValue;
    }
    var resolved = {};
    for (var k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) resolved[k] = base[k];
    }
    resolved.transBuy = pick("transBuy", "Buy");
    resolved.transYouSave = pick("transYouSave", "You save");
    resolved.transAdd = pick("transAdd", "Add");
    return resolved;
  }

  function formatYouSaveText(amountCents, currency, youSaveLabel) {
    var label = String(youSaveLabel || "You save").trim() || "You save";
    return label + " " + fmtMoney(amountCents, currency);
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

  var VD_NON_LOCALE_PATH_SEGMENTS = {
    products: 1,
    collections: 1,
    pages: 1,
    blogs: 1,
    cart: 1,
    account: 1,
    search: 1,
    apps: 1,
    admin: 1,
    challenge: 1,
    policies: 1,
    gift_cards: 1,
  };

  function normalizeLocaleCode(value) {
    var code = String(value || "").trim().toLowerCase();
    if (!code) return "";
    return code.split("-")[0];
  }

  function localeCodeFromPathPrefix(path) {
    var match = String(path || "").match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/|$)/i);
    if (!match || !match[1]) return "";
    var segment = String(match[1]).toLowerCase();
    if (VD_NON_LOCALE_PATH_SEGMENTS[segment]) return "";
    return normalizeLocaleCode(segment);
  }

  /** Active buyer locale (theme language), not the shop's primary locale. */
  function resolveStorefrontLocale(root) {
    var htmlLang =
      document.documentElement && document.documentElement.getAttribute("lang");
    if (htmlLang) return normalizeLocaleCode(htmlLang);

    if (window.Shopify && window.Shopify.locale) {
      return normalizeLocaleCode(window.Shopify.locale);
    }

    var pathLocale = localeCodeFromPathPrefix(
      String(window.location && window.location.pathname ? window.location.pathname : ""),
    );
    if (pathLocale) return pathLocale;

    if (typeof window.__vdStorefrontLocale === "string" && window.__vdStorefrontLocale) {
      return normalizeLocaleCode(window.__vdStorefrontLocale);
    }

    var fromRoot =
      root && root.getAttribute && root.getAttribute("data-storefront-locale");
    if (fromRoot) return normalizeLocaleCode(fromRoot);

    try {
      var routeRoot = shopifyRoutesRoot();
      var routePath = routeRoot.replace(/^https?:\/\/[^/]+/i, "");
      var routeLocale = localeCodeFromPathPrefix(routePath);
      if (routeLocale) return routeLocale;
    } catch (e) {
      void e;
    }

    return "en";
  }

  var VD_CART_LOCALE_ATTR = "vd_locale";
  var VD_LOCKED_PRODUCTS_ATTR = "vd_locked_products";
  var VD_MAX_DISCOUNT_PRODUCTS_STANDARD = 500;
  var vdLastSyncedCartLocale = "";
  var vdLastSyncedLockedProducts = "";
  var vdCachedMaxDiscountProducts = VD_MAX_DISCOUNT_PRODUCTS_STANDARD;

  function resolveMaxDiscountProducts(cfg) {
    if (
      cfg &&
      typeof cfg.maxDiscountProducts === "number" &&
      cfg.maxDiscountProducts > 0
    ) {
      return cfg.maxDiscountProducts | 0;
    }
    if (typeof window.__vdMaxDiscountProducts === "number" && window.__vdMaxDiscountProducts > 0) {
      return window.__vdMaxDiscountProducts | 0;
    }
    return vdCachedMaxDiscountProducts > 0
      ? vdCachedMaxDiscountProducts
      : VD_MAX_DISCOUNT_PRODUCTS_STANDARD;
  }

  function rememberMaxDiscountProducts(cfg) {
    var n = resolveMaxDiscountProducts(cfg);
    if (n > 0) {
      vdCachedMaxDiscountProducts = n;
      window.__vdMaxDiscountProducts = n;
    }
    return n;
  }

  function parseLockedProductIds(raw, maxProducts) {
    var max =
      typeof maxProducts === "number" && maxProducts > 0
        ? maxProducts
        : resolveMaxDiscountProducts(null);
    var s = String(raw || "").trim();
    if (!s) return [];
    var out = [];
    var seen = {};
    var parts = s.split(",");
    for (var i = 0; i < parts.length; i++) {
      var trimmed = String(parts[i]).trim();
      if (!trimmed) continue;
      var n = trimmed.replace(/.*\/(\d+)\s*$/, "$1") || trimmed;
      if (!n || seen[n]) continue;
      seen[n] = true;
      out.push(n);
      if (out.length >= max) break;
    }
    return out;
  }

  function productIdFromCartItem(item) {
    if (!item || item.product_id == null) return "";
    return String(item.product_id);
  }

  function computeLockedProductIds(cart, maxProducts) {
    var max =
      typeof maxProducts === "number" && maxProducts > 0
        ? maxProducts
        : resolveMaxDiscountProducts(null);
    if (!cart || !Array.isArray(cart.items)) return [];
    var locked = parseLockedProductIds(
      cart.attributes && cart.attributes[VD_LOCKED_PRODUCTS_ATTR],
      max,
    );
    var inCart = {};
    for (var i = 0; i < cart.items.length; i++) {
      var pid = productIdFromCartItem(cart.items[i]);
      if (pid) inCart[pid] = true;
    }
    locked = locked.filter(function (pid) {
      return inCart[pid];
    });
    var lockedSet = {};
    for (var j = 0; j < locked.length; j++) {
      lockedSet[locked[j]] = true;
    }
    for (var k = 0; k < cart.items.length; k++) {
      if (locked.length >= max) break;
      var nextPid = productIdFromCartItem(cart.items[k]);
      if (!nextPid || lockedSet[nextPid]) continue;
      locked.push(nextPid);
      lockedSet[nextPid] = true;
    }
    return locked;
  }

  /** Keep discount slots stable: already-locked products stay; only new products fill open slots. */
  var vdLockedSyncInFlight = null;
  function syncCartLockedProductsAttribute(cart) {
    if (!cart && vdLockedSyncInFlight) return vdLockedSyncInFlight;

    var work = cart
      ? Promise.resolve(cart)
      : fetch(cartJsUrl(), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }).then(function (r) {
          return r.ok ? r.json() : null;
        });

    var promise = work.then(function (c) {
      if (!c) return null;
      var next = computeLockedProductIds(c);
      var nextStr = next.join(",");
      if (!nextStr && !vdLastSyncedLockedProducts) return c;
      if (nextStr === vdLastSyncedLockedProducts) return c;
      vdLastSyncedLockedProducts = nextStr;
      var attrs = {};
      attrs[VD_LOCKED_PRODUCTS_ATTR] = nextStr;
      return fetch(shopifyRoutesRoot() + "cart/update.js", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ attributes: attrs }),
      })
        .then(function () {
          return c;
        })
        .catch(function () {
          return c;
        });
    });

    function clearLockedInFlight() {
      if (vdLockedSyncInFlight === promise) vdLockedSyncInFlight = null;
    }
    promise.then(clearLockedInFlight, clearLockedInFlight);

    if (!cart) vdLockedSyncInFlight = promise;
    return promise;
  }

  var vdCartAttrSyncBusy = false;

  function isCartMutationUrl(url) {
    var u = String(url || "");
    return (
      u.indexOf("/cart/add") !== -1 ||
      u.indexOf("/cart/change") !== -1 ||
      u.indexOf("/cart/update") !== -1 ||
      u.indexOf("/cart/clear") !== -1
    );
  }

  function isVdAttributeOnlyCartUpdate(init, attrName) {
    try {
      var body = init && init.body;
      if (!body || typeof body !== "string") return false;
      var parsed = JSON.parse(body);
      var attrs = parsed && parsed.attributes;
      if (!attrs || typeof attrs !== "object") return false;
      var keys = Object.keys(attrs);
      return keys.length === 1 && keys[0] === attrName;
    } catch (e) {
      void e;
      return false;
    }
  }

  function isVdLockedProductsOnlyUpdate(init) {
    return isVdAttributeOnlyCartUpdate(init, VD_LOCKED_PRODUCTS_ATTR);
  }

  function isVdLocaleOnlyUpdate(init) {
    return isVdAttributeOnlyCartUpdate(init, VD_CART_LOCALE_ATTR);
  }

  /** Sync locked discount slots immediately after any cart mutation (theme /cart/add.js, etc.). */
  function installCartMutationInterceptor() {
    if (window.__vdCartMutationIntercept) return;
    window.__vdCartMutationIntercept = true;
    var nativeFetch = window.fetch;
    if (typeof nativeFetch !== "function") return;

    window.fetch = function (input, init) {
      var url =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && input.url
            ? input.url
            : "";
      var isMutation =
        isCartMutationUrl(url) &&
        !isVdLockedProductsOnlyUpdate(init) &&
        !isVdLocaleOnlyUpdate(init);
      var promise = nativeFetch.apply(this, arguments);
      if (!isMutation) return promise;

      return promise.then(function (res) {
        if (!res || !res.ok || vdCartAttrSyncBusy) return res;
        vdCartAttrSyncBusy = true;
        var prevLocked = vdLastSyncedLockedProducts;
        return syncCartLockedProductsAttribute(null)
          .then(function (cart) {
            if (cart && vdLastSyncedLockedProducts !== prevLocked) {
              dispatchCartRefresh(cart);
            }
            return res;
          })
          .finally(function () {
            vdCartAttrSyncBusy = false;
          });
      });
    };
  }

  /** Persist active theme locale on the cart so the discount function badge matches /fr/, /de/, etc. */
  function syncCartLocaleAttribute(force) {
    var locale = resolveStorefrontLocale(null);
    if (!locale) locale = "en";
    if (!force && locale === vdLastSyncedCartLocale) {
      return Promise.resolve();
    }
    vdLastSyncedCartLocale = locale;
    try {
      sessionStorage.setItem("vd_locale_attr", locale);
    } catch (e) {
      void e;
    }
    var attrs = {};
    attrs[VD_CART_LOCALE_ATTR] = locale;
    return fetch(shopifyRoutesRoot() + "cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ attributes: attrs }),
    }).catch(function () {});
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
      /* One primary event — themes listen to cart:updated; avoid triple fan-out storms. */
      document.documentElement.dispatchEvent(
        new CustomEvent("cart:updated", { bubbles: true, detail: detail }),
      );
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: cart }));
    } catch (e) {
      void e;
    }
    scheduleCartDrawerDiscountLabelPatch();
  }

  function fetchCartAndRefresh() {
    return syncCartLocaleAttribute(false).then(function () {
      return fetch(cartJsUrl(), {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (cart) {
          if (!cart) return null;
          return syncCartLockedProductsAttribute(cart).then(function () {
            dispatchCartRefresh(cart);
            return cart;
          });
        })
        .catch(function () {
          return null;
        });
    });
  }

  function storefrontSectionsUrl() {
    return window.location.pathname + (window.location.search || "");
  }

  function localeAwareSectionsUrl() {
    var locale = resolveStorefrontLocale(null) || "en";
    var path = window.location.pathname || "/";
    var search = window.location.search || "";
    if (locale !== "en" && !localeCodeFromPathPrefix(path)) {
      var rootPath = shopifyRoutesRoot().replace(/^https?:\/\/[^/]+/i, "");
      if (rootPath && rootPath !== "/" && path.indexOf(rootPath) === 0) {
        path = path.slice(rootPath.length) || "/";
      }
      if (path.charAt(0) !== "/") path = "/" + path;
      path = "/" + locale + (path === "/" ? "" : path);
    }
    return path + search;
  }

  function refreshCartDrawerForLocaleChange() {
    var sectionIds = getThemeCartSectionsParam();
    if (!sectionIds) {
      scheduleCartDrawerDiscountLabelPatch();
      return Promise.resolve(null);
    }
    var locale = resolveStorefrontLocale(null) || "en";
    var attrs = {};
    attrs[VD_CART_LOCALE_ATTR] = locale;
    return fetch(shopifyRoutesRoot() + "cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        attributes: attrs,
        sections: sectionIds,
        sections_url: localeAwareSectionsUrl(),
      }),
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (body && body.sections) {
          applyThemeCartSectionsFromResponse(body, false);
        }
        scheduleCartDrawerDiscountLabelPatch();
        return body;
      })
      .catch(function () {
        scheduleCartDrawerDiscountLabelPatch();
        return null;
      });
  }

  function findThemeCartDrawerEl() {
    return (
      document.querySelector("cart-drawer") ||
      document.querySelector("cart-notification") ||
      document.getElementById("CartDrawer") ||
      document.querySelector("cart-drawer-component") ||
      document.querySelector("[id*='CartDrawer']") ||
      document.querySelector("[id*='cart-drawer']")
    );
  }

  /** Same IDs Dawn ProductForm sends — must match renderContents lookup keys (section.id). */
  function getThemeCartSectionIds() {
    try {
      var drawer = findThemeCartDrawerEl();
      if (drawer && typeof drawer.getSectionsToRender === "function") {
        return drawer
          .getSectionsToRender()
          .map(function (section) {
            return section.id || section.section;
          })
          .filter(Boolean);
      }
    } catch (e) {
      void e;
    }
    return ["cart-drawer", "cart-icon-bubble"];
  }

  function getThemeCartSectionsParam() {
    return getThemeCartSectionIds().join(",");
  }

  function cartResponseHasSectionHtml(sections) {
    if (!sections || typeof sections !== "object") return false;
    var ids = getThemeCartSectionIds();
    for (var i = 0; i < ids.length; i++) {
      if (sections[ids[i]]) return true;
    }
    var keys = Object.keys(sections);
    for (var k = 0; k < keys.length; k++) {
      if (sections[keys[k]]) return true;
    }
    return false;
  }

  function clickHeaderCartIcon() {
    var selectors = [
      "#cart-icon-bubble",
      "a#cart-icon-bubble",
      "cart-icon-bubble a",
      "cart-icon-bubble",
      ".header__icon--cart",
      "a.header__icon--cart",
      "button.header__icon--cart",
      "[data-cart-drawer-trigger]",
      "[data-action='open-cart']",
      "a[href='/cart']",
      "a[href$='/cart']",
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && typeof el.click === "function") {
        try {
          el.click();
          return true;
        } catch (eClick) {
          void eClick;
        }
      }
    }
    return false;
  }

  function isThemeCartDrawerOpen() {
    var drawer =
      document.querySelector("cart-drawer") ||
      document.querySelector("cart-notification") ||
      document.querySelector("cart-drawer-component");
    if (!drawer) return false;
    return !!(
      drawer.hasAttribute("open") ||
      drawer.classList.contains("active") ||
      drawer.classList.contains("is-open") ||
      drawer.classList.contains("animate")
    );
  }

  /**
   * Open theme cart drawer. Prefer drawer.open(); if that does not stick,
   * click the header cart icon (do NOT fake active/open classes first — that
   * previously skipped the icon click and left the drawer closed).
   */
  function openThemeCartDrawer() {
    try {
      var drawer = document.querySelector("cart-drawer");
      if (drawer) {
        try {
          drawer.classList.remove("is-empty");
        } catch (eEmpty) {
          void eEmpty;
        }
        if (typeof drawer.open === "function") {
          try {
            drawer.open();
          } catch (eOpen) {
            void eOpen;
          }
          if (isThemeCartDrawerOpen()) return true;
        }
      }

      var notif = document.querySelector("cart-notification");
      if (notif && typeof notif.open === "function") {
        try {
          notif.open();
        } catch (eN) {
          void eN;
        }
        if (isThemeCartDrawerOpen()) return true;
      }

      var component = document.querySelector("cart-drawer-component");
      if (component && typeof component.open === "function") {
        try {
          component.open();
        } catch (eC) {
          void eC;
        }
        if (isThemeCartDrawerOpen()) return true;
      }

      return clickHeaderCartIcon();
    } catch (e) {
      return clickHeaderCartIcon();
    }
  }

  function forceOpenThemeCartDrawer() {
    openThemeCartDrawer();
    setTimeout(function () {
      if (!isThemeCartDrawerOpen()) clickHeaderCartIcon();
    }, 100);
    setTimeout(function () {
      if (!isThemeCartDrawerOpen()) clickHeaderCartIcon();
    }, 350);
  }

  function publishThemeCartUpdate(cartData) {
    try {
      if (
        typeof window.publish === "function" &&
        window.PUB_SUB_EVENTS &&
        window.PUB_SUB_EVENTS.cartUpdate
      ) {
        window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
          source: "offrefy-volume-discount",
          cartData: cartData || {},
        });
      }
    } catch (e) {
      void e;
    }
    try {
      document.documentElement.dispatchEvent(
        new CustomEvent("cart:updated", {
          bubbles: true,
          detail: { cart: cartData },
        }),
      );
      document.dispatchEvent(
        new CustomEvent("cart:change", {
          bubbles: true,
          detail: { cart: cartData },
        }),
      );
    } catch (e2) {
      void e2;
    }
  }

  function findVdLiquidProductForm(root) {
    var el = root || document.querySelector(".vd-storefront-root");
    if (el) {
      var id = el.getAttribute("data-vd-product-form-id");
      if (id) {
        var byId = document.getElementById(id);
        if (byId) return byId;
      }
      var inRoot =
        el.querySelector("form[data-vd-liquid-product-form]") ||
        el.querySelector("form.vd-liquid-product-form");
      if (inRoot) return inRoot;
    }
    return (
      document.querySelector("form[data-vd-liquid-product-form]") ||
      document.querySelector("form.vd-liquid-product-form")
    );
  }

  function syncVdLiquidProductForm(form, variantId, quantity, attribution) {
    if (!form) return false;
    var vid = String(variantId || "");
    var qty = parseInt(String(quantity), 10) || 1;
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var idInput =
      form.querySelector("[data-vd-liquid-variant-id]") ||
      form.querySelector('input[name="id"]');
    if (idInput && vid) idInput.value = vid;
    var qtyInput =
      form.querySelector("[data-vd-liquid-qty]") ||
      form.querySelector('input[name="quantity"]');
    if (qtyInput) qtyInput.value = String(qty);
    applyOffrefyPropertiesToForm(form, attribution);
    return true;
  }

  function findThemeProductAddForm() {
    var forms = document.querySelectorAll(
      'form[action*="/cart/add"], form[action*="cart/add"], form[data-type="add-to-cart-form"], form.product-form, product-form form, form#product_form, form#AddToCartForm, form[id*="product-form"], form[id*="ProductForm"]',
    );
    var widget = document.querySelector(".vd-storefront-root");
    var widgetScope = widget
      ? widget.closest(
          "product-info, .product, [id^='MainProduct'], .shopify-section, .product__info, .product-single, .product-details",
        )
      : null;
    var best = null;
    var bestScore = -1;

    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (!form) continue;
      /* Skip our Liquid bridge form — theme ATC must be the theme's own form. */
      if (
        form.hasAttribute("data-vd-liquid-product-form") ||
        (form.classList && form.classList.contains("vd-liquid-product-form"))
      ) {
        continue;
      }
      if (form.closest(".vd-storefront-root")) continue;
      if (
        form.closest(
          "cart-drawer, cart-notification, #CartDrawer, .cart-drawer, cart-items, #main-cart-items",
        )
      ) {
        continue;
      }

      var score = 0;
      if (form.querySelector('[name="id"]')) score += 4;
      if (
        form.querySelector(
          'button[name="add"], input[name="add"], button.product-form__submit, [data-add-to-cart], [data-action="add-to-cart"]',
        )
      ) {
        score += 4;
      }
      if (
        form.closest(
          "product-info, .product, [id^='MainProduct'], .product-form, .product__info, .product-single",
        )
      ) {
        score += 3;
      }
      if (widgetScope && widgetScope.contains(form)) score += 8;
      if (form.querySelector('[name="quantity"]')) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = form;
      }
    }

    if (best) return best;

    var all = document.querySelectorAll('form[action*="/cart/add"]');
    for (var j = 0; j < all.length; j++) {
      if (
        all[j].hasAttribute("data-vd-liquid-product-form") ||
        (all[j].classList && all[j].classList.contains("vd-liquid-product-form"))
      ) {
        continue;
      }
      if (!all[j].closest(".vd-storefront-root")) return all[j];
    }
    return null;
  }

  function isThemeBuyItNowButton(el) {
    if (!el) return true;
    if (el.closest(".shopify-payment-button, [data-shopify='payment-button']")) {
      return true;
    }
    var name = String(el.getAttribute("name") || "").toLowerCase();
    if (name === "checkout" || name === "goto_checkout") return true;
    var label = String(el.textContent || el.value || "")
      .trim()
      .toLowerCase();
    if (!label) return false;
    if (
      label.indexOf("buy it now") !== -1 ||
      label.indexOf("buy now") !== -1 ||
      label.indexOf("acheter maintenant") !== -1 ||
      label.indexOf("jetzt kaufen") !== -1
    ) {
      /* Allow if it also clearly says add to cart */
      if (
        label.indexOf("add to cart") === -1 &&
        label.indexOf("add to bag") === -1 &&
        label.indexOf("ajouter") === -1
      ) {
        return true;
      }
    }
    return false;
  }

  function findThemeAddToCartButton(form) {
    if (!form) return null;

    var selectors = [
      'button[name="add"]',
      'button[name="add"][type="submit"]',
      'input[type="submit"][name="add"]',
      "button.product-form__submit",
      'button[data-add-to-cart]',
      '[data-add-to-cart]',
      '[data-action="add-to-cart"]',
      'button[data-action="add-to-cart"]',
      ".product-form__cart-submit",
      ".product-form--atc-button",
      ".btn--add-to-cart",
      ".add-to-cart",
      ".AddToCart",
      "#AddToCart",
      "#add-to-cart",
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    for (var s = 0; s < selectors.length; s++) {
      var nodes = form.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.closest(".vd-storefront-root")) continue;
        if (isThemeBuyItNowButton(el)) continue;
        return el;
      }
    }

    /* Some themes put ATC outside the <form> but linked via form= id */
    var formId = form.getAttribute("id");
    if (formId) {
      var linked = document.querySelectorAll(
        'button[name="add"][form], button.product-form__submit[form], [data-add-to-cart][form], button[type="submit"][form]',
      );
      for (var li = 0; li < linked.length; li++) {
        if (linked[li].getAttribute("form") === formId) {
          if (!isThemeBuyItNowButton(linked[li])) return linked[li];
        }
      }
    }

    /* Section-scoped search near the form */
    var scope =
      form.closest("product-info, .product, [id^='MainProduct'], .shopify-section, .product__info") ||
      form.parentElement;
    if (scope) {
      var ext = scope.querySelector(
        'button[name="add"], button.product-form__submit, [data-add-to-cart], .product-form__cart-submit, #AddToCart',
      );
      if (ext && !ext.closest(".vd-storefront-root") && !isThemeBuyItNowButton(ext)) {
        return ext;
      }
    }

    return null;
  }

  /**
   * Make theme ATC clickable even when merchant hid it via widget settings,
   * then fire a real click / requestSubmit so theme JS (drawer) runs.
   */
  function triggerThemeAtcClick(form, btn) {
    if (!form || !btn) return false;

    var restoreHide =
      document.documentElement.getAttribute("data-vd-hide-theme-atc") === "1" ||
      window.getComputedStyle(btn).display === "none" ||
      btn.getAttribute("aria-hidden") === "true";

    var prev = {
      disabled: !!btn.disabled,
      ariaDisabled: btn.getAttribute("aria-disabled"),
      display: btn.style.getPropertyValue("display"),
      visibility: btn.style.getPropertyValue("visibility"),
      pointerEvents: btn.style.getPropertyValue("pointer-events"),
      position: btn.style.getPropertyValue("position"),
      left: btn.style.getPropertyValue("left"),
      opacity: btn.style.getPropertyValue("opacity"),
      ariaHidden: btn.getAttribute("aria-hidden"),
    };

    try {
      btn.disabled = false;
      btn.removeAttribute("disabled");
      btn.removeAttribute("aria-disabled");
      if (restoreHide) {
        btn.style.setProperty("display", "block", "important");
        btn.style.setProperty("visibility", "visible", "important");
        btn.style.setProperty("pointer-events", "auto", "important");
        btn.style.setProperty("position", "fixed", "important");
        btn.style.setProperty("left", "-9999px", "important");
        btn.style.setProperty("opacity", "0", "important");
        btn.removeAttribute("aria-hidden");
      }

      /* Prefer requestSubmit so themes listening on form submit still run. */
      if (typeof form.requestSubmit === "function" && btn.tagName === "BUTTON") {
        form.requestSubmit(btn);
      } else if (typeof btn.click === "function") {
        btn.click();
      } else if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
      return true;
    } catch (e) {
      try {
        if (typeof btn.click === "function") btn.click();
        return true;
      } catch (e2) {
        return false;
      }
    } finally {
      /* Restore after theme handlers have started (next tick). */
      setTimeout(function () {
        try {
          btn.disabled = prev.disabled;
          if (prev.disabled) btn.setAttribute("disabled", "");
          else btn.removeAttribute("disabled");
          if (prev.ariaDisabled != null) {
            btn.setAttribute("aria-disabled", prev.ariaDisabled);
          } else {
            btn.removeAttribute("aria-disabled");
          }
          if (prev.display) btn.style.setProperty("display", prev.display);
          else btn.style.removeProperty("display");
          if (prev.visibility) btn.style.setProperty("visibility", prev.visibility);
          else btn.style.removeProperty("visibility");
          if (prev.pointerEvents) {
            btn.style.setProperty("pointer-events", prev.pointerEvents);
          } else {
            btn.style.removeProperty("pointer-events");
          }
          if (prev.position) btn.style.setProperty("position", prev.position);
          else btn.style.removeProperty("position");
          if (prev.left) btn.style.setProperty("left", prev.left);
          else btn.style.removeProperty("left");
          if (prev.opacity) btn.style.setProperty("opacity", prev.opacity);
          else btn.style.removeProperty("opacity");
          if (prev.ariaHidden != null) btn.setAttribute("aria-hidden", prev.ariaHidden);
          else if (restoreHide) btn.setAttribute("aria-hidden", "true");
          if (document.documentElement.getAttribute("data-vd-hide-theme-atc") === "1") {
            try {
              hideThemeNativeAddToCartButtons();
            } catch (eHide) {
              void eHide;
            }
          }
        } catch (eRest) {
          void eRest;
        }
      }, 800);
    }
  }

  /**
   * Cross-theme ATC:
   * 1) Theme native Add to Cart click (best drawer UX)
   * 2) Liquid {% form 'product' %} bridge via /cart/add.js (all free/premium themes)
   */
  function addByClickingThemeAtc(variantId, quantity, attribution) {
    var root = document.querySelector(".vd-storefront-root");
    var liquidForm = findVdLiquidProductForm(root);
    var themeForm = findThemeProductAddForm();
    var themeBtn = findThemeAddToCartButton(themeForm);

    if (liquidForm) {
      syncVdLiquidProductForm(liquidForm, variantId, quantity, attribution);
    }
    if (themeForm) {
      syncThemeProductFormFields(themeForm, variantId, quantity, attribution);
    } else {
      setThemeProductFormQuantity(quantity);
    }

    function waitForCartIncrease(prev) {
      return new Promise(function (resolve, reject) {
        var tries = 0;
        var iv = setInterval(function () {
          tries += 1;
          fetchCartItemCount().then(function (cart) {
            if (cart && cart.item_count > prev) {
              clearInterval(iv);
              resolve(cart);
              return;
            }
            if (tries >= 24) {
              clearInterval(iv);
              reject(new Error("Theme ATC did not add"));
            }
          });
        }, 250);
      });
    }

    if (themeForm && themeBtn) {
      return fetchCartItemCount().then(function (before) {
        var prev = before ? before.item_count : 0;
        if (!triggerThemeAtcClick(themeForm, themeBtn)) {
          return Promise.reject(new Error("Theme ATC click failed"));
        }
        return waitForCartIncrease(prev);
      }).catch(function () {
        if (!liquidForm) {
          return Promise.reject(new Error("No theme or liquid product form"));
        }
        return addVariantToCartViaFetch(
          variantId,
          quantity,
          true,
          attribution,
        );
      });
    }

    if (liquidForm) {
      return addVariantToCartViaFetch(variantId, quantity, true, attribution);
    }

    return Promise.reject(new Error("No theme or liquid product form"));
  }

  /**
   * Theme qty inputs are often outside form[action*="/cart/add"] (Dawn uses
   * form="product-form-…" on quantity-input). Collect all product-page qty fields.
   */
  function collectThemeProductQuantityInputs(form) {
    var list = [];
    var seen =
      typeof WeakSet !== "undefined"
        ? new WeakSet()
        : {
            _a: [],
            has: function (el) {
              return this._a.indexOf(el) !== -1;
            },
            add: function (el) {
              this._a.push(el);
            },
          };

    function add(el) {
      if (!el || (el.closest && el.closest(".vd-storefront-root"))) return;
      if (String(el.getAttribute("type") || "").toLowerCase() === "hidden") return;
      if (
        el.closest &&
        el.closest(
          "cart-drawer, cart-notification, #CartDrawer, .cart-item, cart-items, #main-cart-items",
        )
      ) {
        return;
      }
      if (seen.has(el)) return;
      seen.add(el);
      list.push(el);
    }

    function addFromRoot(root) {
      if (!root || !root.querySelectorAll) return;
      var nodes = root.querySelectorAll(
        'input[name="quantity"], select[name="quantity"]',
      );
      for (var i = 0; i < nodes.length; i++) add(nodes[i]);
    }

    if (form) {
      addFromRoot(form);
      var formId = form.getAttribute("id");
      if (formId) {
        var linked = document.querySelectorAll(
          'input[name="quantity"][form], select[name="quantity"][form]',
        );
        for (var j = 0; j < linked.length; j++) {
          if (linked[j].getAttribute("form") === formId) add(linked[j]);
        }
      }
      var scope =
        form.closest("product-info") ||
        form.closest("[id^='MainProduct']") ||
        form.closest(".shopify-section--main-product") ||
        form.closest(".shopify-section") ||
        form.closest(".product") ||
        form.parentElement;
      if (scope) addFromRoot(scope);
    } else {
      var sections = document.querySelectorAll(
        "product-info, [id^='MainProduct'], .shopify-section--main-product",
      );
      for (var s = 0; s < sections.length; s++) addFromRoot(sections[s]);
    }

    return list;
  }

  function setThemeProductFormQuantity(quantity) {
    var qty = parseInt(String(quantity), 10) || 1;
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var form = findThemeProductAddForm();
    var inputs = collectThemeProductQuantityInputs(form);
    var str = String(qty);
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      try {
        inp.value = str;
        if (typeof inp.setAttribute === "function") {
          inp.setAttribute("value", str);
        }
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {
        void e;
      }
    }
    var liquid = findVdLiquidProductForm(null);
    if (liquid) {
      var lq =
        liquid.querySelector("[data-vd-liquid-qty]") ||
        liquid.querySelector('input[name="quantity"]');
      if (lq) lq.value = str;
    }
    return inputs.length > 0 || !!liquid;
  }

  function readThemeProductFormQuantity(fallback) {
    var form = findThemeProductAddForm();
    var inputs = collectThemeProductQuantityInputs(form);
    for (var i = 0; i < inputs.length; i++) {
      var n = parseInt(String(inputs[i].value), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    var fb = parseInt(String(fallback), 10);
    return Number.isFinite(fb) && fb > 0 ? fb : 1;
  }

  function syncThemeProductFormFields(form, variantId, quantity, attribution) {
    if (!form) return false;
    var vid = String(variantId || "");
    if (vid) {
      var vs = form.querySelector('select[name="id"]');
      if (vs) {
        vs.value = vid;
        vs.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var hid = form.querySelector('input[name="id"][type="hidden"]');
      if (hid) {
        hid.value = vid;
        hid.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var radios = form.querySelectorAll('input[type="radio"][name="id"]');
      for (var ri = 0; ri < radios.length; ri++) {
        var rad = radios[ri];
        rad.checked = String(rad.value) === vid;
        if (rad.checked) {
          rad.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    setThemeProductFormQuantity(quantity);
    applyOffrefyPropertiesToForm(form, attribution);
    return true;
  }

  function waitForThemeCartAdd(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function finishOk(detail) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(detail || null);
      }
      function finishErr(err) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err || new Error("Theme add to cart did not complete"));
      }
      function onCartEvent(ev) {
        finishOk(ev && ev.detail ? ev.detail : {});
      }
      function cleanup() {
        clearTimeout(timer);
        document.removeEventListener("cart:updated", onCartEvent, true);
        document.documentElement.removeEventListener("cart:updated", onCartEvent, true);
        document.removeEventListener("cart:change", onCartEvent, true);
        document.documentElement.removeEventListener("cart:change", onCartEvent, true);
      }
      document.addEventListener("cart:updated", onCartEvent, true);
      document.documentElement.addEventListener("cart:updated", onCartEvent, true);
      document.addEventListener("cart:change", onCartEvent, true);
      document.documentElement.addEventListener("cart:change", onCartEvent, true);
      var timer = setTimeout(function () {
        finishErr(new Error("Theme add to cart did not complete"));
      }, timeoutMs || 2500);
    });
  }

  function submitThemeProductAddForm(variantId, quantity, attribution) {
    var form = findThemeProductAddForm();
    var btn = findThemeAddToCartButton(form);
    if (!form || !btn) {
      return Promise.reject(new Error("No theme product form"));
    }
    syncThemeProductFormFields(form, variantId, quantity, attribution);

    /* Theme ATC may be visually hidden — keep it clickable off-screen so the
       theme ProductForm submit runs (Shopify default add + cart drawer). */
    var restoreHide =
      document.documentElement.getAttribute("data-vd-hide-theme-atc") === "1";
    var prev = {
      display: btn.style.getPropertyValue("display"),
      position: btn.style.getPropertyValue("position"),
      left: btn.style.getPropertyValue("left"),
      opacity: btn.style.getPropertyValue("opacity"),
      pointerEvents: btn.style.getPropertyValue("pointer-events"),
      zIndex: btn.style.getPropertyValue("z-index"),
      ariaHidden: btn.getAttribute("aria-hidden"),
    };
    if (restoreHide) {
      btn.style.setProperty("display", "block", "important");
      btn.style.setProperty("position", "fixed", "important");
      btn.style.setProperty("left", "-9999px", "important");
      btn.style.setProperty("opacity", "0", "important");
      btn.style.setProperty("pointer-events", "auto", "important");
      btn.style.setProperty("z-index", "0", "important");
      btn.removeAttribute("aria-hidden");
    }

    function restoreBtn() {
      if (!restoreHide) return;
      if (prev.display) btn.style.setProperty("display", prev.display);
      else btn.style.removeProperty("display");
      if (prev.position) btn.style.setProperty("position", prev.position);
      else btn.style.removeProperty("position");
      if (prev.left) btn.style.setProperty("left", prev.left);
      else btn.style.removeProperty("left");
      if (prev.opacity) btn.style.setProperty("opacity", prev.opacity);
      else btn.style.removeProperty("opacity");
      if (prev.pointerEvents) {
        btn.style.setProperty("pointer-events", prev.pointerEvents);
      } else {
        btn.style.removeProperty("pointer-events");
      }
      if (prev.zIndex) btn.style.setProperty("z-index", prev.zIndex);
      else btn.style.removeProperty("z-index");
      if (prev.ariaHidden != null) btn.setAttribute("aria-hidden", prev.ariaHidden);
      else btn.setAttribute("aria-hidden", "true");
      try {
        hideThemeNativeAddToCartButtons();
      } catch (e) {
        void e;
      }
    }

    var waitPromise = waitForThemeCartAdd(10000);
    try {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(btn);
      } else if (typeof btn.click === "function") {
        btn.click();
      } else {
        form.submit();
      }
    } catch (clickErr) {
      restoreBtn();
      return Promise.reject(clickErr);
    }

    return waitPromise.then(
      function (detail) {
        restoreBtn();
        return detail;
      },
      function (err) {
        restoreBtn();
        return Promise.reject(err);
      },
    );
  }

  function applyThemeCartSectionsFromResponse(response, openDrawer) {
    if (!response || !cartResponseHasSectionHtml(response.sections)) return false;
    try {
      var drawer =
        document.querySelector("cart-drawer") ||
        document.querySelector("cart-notification") ||
        findThemeCartDrawerEl();
      if (drawer && typeof drawer.renderContents === "function") {
        try {
          /* Dawn renderContents updates HTML and opens the drawer. */
          if (drawer.renderContents.length >= 2) {
            drawer.renderContents(response, true);
          } else {
            drawer.renderContents(response);
          }
        } catch (eRender) {
          try {
            drawer.renderContents(response);
          } catch (e2) {
            void e2;
            return manualApplyCartSections(response.sections, openDrawer);
          }
        }
        try {
          drawer.classList.remove("is-empty");
        } catch (eEmpty) {
          void eEmpty;
        }
        scheduleCartDrawerDiscountLabelPatch();
        if (openDrawer) {
          setTimeout(function () {
            if (!isThemeCartDrawerOpen() && typeof drawer.open === "function") {
              try {
                drawer.open();
              } catch (eO) {
                void eO;
              }
            }
          }, 120);
        }
        return true;
      }
      return manualApplyCartSections(response.sections, openDrawer);
    } catch (e) {
      void e;
    }
    return false;
  }

  function getSectionInnerHTML(html, selector) {
    var div = document.createElement("div");
    div.innerHTML = html;
    if (selector) {
      var node = div.querySelector(selector);
      return node ? node.innerHTML : div.innerHTML;
    }
    return div.innerHTML;
  }

  /** Fallback when theme has no renderContents — patch section DOM then open(). */
  function manualApplyCartSections(sections, openDrawer) {
    if (!sections) return false;
    var drawer =
      document.querySelector("cart-drawer") ||
      document.querySelector("cart-notification");
    var list = [];
    try {
      if (drawer && typeof drawer.getSectionsToRender === "function") {
        list = drawer.getSectionsToRender();
      }
    } catch (eList) {
      void eList;
    }
    if (!list.length) {
      list = [
        { id: "cart-drawer", selector: "#CartDrawer" },
        { id: "cart-icon-bubble" },
      ];
    }
    var applied = false;
    for (var i = 0; i < list.length; i++) {
      var section = list[i];
      var html = sections[section.id] || sections[section.section];
      if (!html) continue;
      var el = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);
      if (!el && section.id) {
        el = document.getElementById("shopify-section-" + section.id);
      }
      if (!el) continue;
      try {
        el.innerHTML = getSectionInnerHTML(html, section.selector);
        applied = true;
      } catch (eSet) {
        void eSet;
      }
    }
    if (applied && drawer) {
      try {
        drawer.classList.remove("is-empty");
      } catch (eEmpty2) {
        void eEmpty2;
      }
      if (openDrawer && typeof drawer.open === "function") {
        try {
          drawer.open();
        } catch (eOpen2) {
          void eOpen2;
        }
      }
      scheduleCartDrawerDiscountLabelPatch();
    }
    return applied;
  }

  /**
   * Re-fetch LIVE cart section HTML (with items), patch drawer, then open.
   * Never open via cart-icon click alone — that shows a stale empty drawer.
   */
  function refreshThemeCartSectionsAndOpen(openDrawer) {
    var sectionIds = getThemeCartSectionsParam();
    if (!sectionIds) return Promise.resolve(null);
    return fetch(shopifyRoutesRoot() + "cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sections: sectionIds,
        sections_url: storefrontSectionsUrl(),
      }),
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (body && body.sections) {
          if (!applyThemeCartSectionsFromResponse(body, openDrawer)) {
            manualApplyCartSections(body.sections, openDrawer);
          }
        }
        scheduleCartDrawerDiscountLabelPatch();
        return body;
      })
      .catch(function () {
        return null;
      });
  }

  function fetchCartItemCount() {
    return fetch(cartJsUrl(), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        return cart && typeof cart.item_count === "number" ? cart : null;
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * Fallback: /cart/add.js then refresh LIVE drawer sections before opening.
   * Never open an empty/stale drawer via cart-icon click.
   */
  function addVariantToCartViaFetch(variantId, quantity, openDrawer, attribution) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) {
      return Promise.reject(new Error("Invalid variant"));
    }
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));

    var form = findThemeProductAddForm() || findVdLiquidProductForm(null);
    if (form) {
      if (form.hasAttribute("data-vd-liquid-product-form") || (form.classList && form.classList.contains("vd-liquid-product-form"))) {
        syncVdLiquidProductForm(form, id, qty, attribution);
      } else {
        syncThemeProductFormFields(form, id, qty, attribution);
      }
    }

    var sectionIds = getThemeCartSectionIds();
    var fetchOpts;
    if (form) {
      var formData = new FormData(form);
      formData.set("id", String(id));
      formData.set("quantity", String(qty));
      try {
        formData.delete("sections");
        formData.delete("sections_url");
      } catch (eDel) {
        void eDel;
      }
      if (sectionIds.length) {
        formData.append("sections", sectionIds.join(","));
        formData.append("sections_url", storefrontSectionsUrl());
      }
      var props = offrefyCartProperties(attribution);
      if (props) {
        for (var pk in props) {
          if (Object.prototype.hasOwnProperty.call(props, pk)) {
            formData.set("properties[" + pk + "]", String(props[pk]));
          }
        }
      }
      fetchOpts = {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: formData,
      };
    } else {
      var item = { id: id, quantity: qty };
      var propsJson = offrefyCartProperties(attribution);
      if (propsJson) item.properties = propsJson;
      var payload = { items: [item] };
      if (sectionIds.length) {
        payload.sections = sectionIds.join(",");
        payload.sections_url = storefrontSectionsUrl();
      }
      fetchOpts = {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      };
    }

    return syncCartLocaleAttribute(true).then(function () {
      return fetch(cartAddJsUrl(), fetchOpts).then(function (res) {
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

          return fetchCartItemCount().then(function (cart) {
            if (!cart || !(cart.item_count > 0)) {
              throw new Error("Could not add to cart");
            }
            publishThemeCartUpdate(cart);
            if (!openDrawer) return body;
            /* Always re-fetch live section HTML so drawer is not empty. */
            return refreshThemeCartSectionsAndOpen(true).then(function () {
              return body;
            });
          });
        });
      });
    });
  }

  function shouldOpenDrawerAfterAdd(action) {
    return String(action || "add_to_cart_open_drawer") === "add_to_cart_open_drawer";
  }

  function addVariantToCart(variantId, quantity, action, attribution) {
    var openDrawer = shouldOpenDrawerAfterAdd(action);
    /* Always prefer theme ATC for add / open-drawer CTAs — works across Shopify themes. */
    var useThemeAtc =
      !action ||
      action === "add_to_cart" ||
      action === "add_to_cart_open_drawer";

    if (useThemeAtc) {
      return addByClickingThemeAtc(variantId, quantity, attribution).catch(
        function () {
          return addVariantToCartViaFetch(
            variantId,
            quantity,
            openDrawer,
            attribution,
          );
        },
      );
    }
    return addVariantToCartViaFetch(
      variantId,
      quantity,
      openDrawer,
      attribution,
    );
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
    if (act === "go_to_checkout") {
      window.location.href = checkoutUrlHref();
      return Promise.resolve();
    }
    if (act === "go_to_page") {
      var href = resolveSafePageHref(ui.ctaButtonPageUrl);
      if (href) window.location.href = href;
      return Promise.resolve();
    }
    /* Drawer open is done by theme ATC or refreshThemeCartSectionsAndOpen.
       Do not force-open here — that opened a stale empty drawer. */
    return Promise.resolve();
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

  var vdHidePurchaseUiScheduled = false;
  function ensureThemePurchaseUiHideObserver() {
    if (vdHidePurchaseUiObserver || typeof MutationObserver === "undefined") return;
    vdHidePurchaseUiObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target;
        if (
          t &&
          t.closest &&
          (t.closest(".vd-storefront-root") ||
            t.closest("cart-drawer") ||
            t.closest("#CartDrawer") ||
            t.closest("cart-notification") ||
            t.closest("#cart-notification"))
        ) {
          continue;
        }
        if (vdHidePurchaseUiScheduled) return;
        vdHidePurchaseUiScheduled = true;
        requestAnimationFrame(function () {
          vdHidePurchaseUiScheduled = false;
          applyThemePurchaseUiHides();
        });
        return;
      }
    });
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
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "center");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "center");
    if (ha === "center" && ca === "center") return "stacked";
    return explicit;
  }

  /**
   * Split row + heading right + timer left → swap order (timer on the left, title on the right).
   * Matches the common intent of end/start alignments; explicit swap still applies otherwise.
   */
  function effectiveWidgetHeaderSwapOrder(d) {
    var layout = effectiveWidgetHeaderLayout(d);
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "center");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "center");
    if (layout === "split" && ha === "end" && ca === "start") {
      return true;
    }
    return d.widgetHeaderSwapOrder === true;
  }

  function pickWidgetHeaderTextAlign(v, fallback) {
    var s = String(v != null ? v : fallback || "center").trim();
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
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "center");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "center");
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
    showCountdown: false,
    widgetHeaderLayout: "split",
    widgetHeadingAlign: "center",
    countdownAlign: "center",
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
    transQty: "Qty",
    transDiscount: "Discount",
    transPrice: "Price / ea",
    transBuy: "Buy",
    transYouSave: "You save",
    transAdd: "Add",
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

  function hydrateRootProductDataFromJson(root, options) {
    var opts = options || {};
    var forcePrice = opts.forcePrice === true;
    var existingPid = root.getAttribute("data-product-id");
    var existingPrice = parseInt(
      String(root.getAttribute("data-unit-price-cents") || "0"),
      10,
    );
    if (existingPid && (!forcePrice || (existingPrice && existingPrice > 0))) {
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

        var wantedVid =
          root.getAttribute("data-variant-id") ||
          readThemeVariantIdForHydration();
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
        } else if (forcePrice) {
          return false;
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
    d.widgetHeadingAlign = pickWidgetHeaderTextAlign(
      d.widgetHeadingAlign,
      WD_DEFAULT.widgetHeadingAlign,
    );
    d.countdownAlign = pickWidgetHeaderTextAlign(
      d.countdownAlign,
      WD_DEFAULT.countdownAlign,
    );
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
      showCountdown: d.showCountdown === true,
      countdownLabel: String(d.countdownLabel || WD_DEFAULT.countdownLabel).trim() ||
        WD_DEFAULT.countdownLabel,
      countdownTimeUnit: pickCountdownTimeUnit(d.countdownTimeUnit),
      ctaLabel: String(d.ctaLabel || "Grab this deal").trim() || "Grab this deal",
      footnote: String(d.footnote || WD_DEFAULT.footnote).trim() || WD_DEFAULT.footnote,
      transQty: String(d.transQty || "").trim() || "Quantity",
      transDiscount: String(d.transDiscount || "").trim() || "Discount",
      transPrice: String(d.transPrice || "").trim() || "Price per Item",
      transBuy: String(d.transBuy || "").trim() || "Buy",
      transYouSave: String(d.transYouSave || "").trim() || "You save",
      transAdd: String(d.transAdd || "").trim() || "Add",
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

    // Apply translations for the active theme language.
    var locale = resolveStorefrontLocale(root);
    var transMap = resolveWidgetTranslations(root, campaign);
    var langTrans = resolveLangTranslation(locale, transMap, root);
    var widgetDisplay = {};
    if (campaign.widgetDisplay) {
      for (var k in campaign.widgetDisplay) {
        if (Object.prototype.hasOwnProperty.call(campaign.widgetDisplay, k)) {
          widgetDisplay[k] = campaign.widgetDisplay[k];
        }
      }
    }
    if (langTrans.transHeading != null && langTrans.transHeading !== "") widgetDisplay.widgetHeading = langTrans.transHeading;
    if (langTrans.transCta != null && langTrans.transCta !== "") widgetDisplay.ctaLabel = langTrans.transCta;
    if (langTrans.transFootnote != null && langTrans.transFootnote !== "") widgetDisplay.footnote = langTrans.transFootnote;
    if (langTrans.transCountdown != null && langTrans.transCountdown !== "") widgetDisplay.countdownLabel = langTrans.transCountdown;
    if (langTrans.transQty != null && langTrans.transQty !== "") widgetDisplay.transQty = langTrans.transQty;
    if (langTrans.transDiscount != null && langTrans.transDiscount !== "") widgetDisplay.transDiscount = langTrans.transDiscount;
    if (langTrans.transPrice != null && langTrans.transPrice !== "") widgetDisplay.transPrice = langTrans.transPrice;
    if (langTrans.transBuy != null && langTrans.transBuy !== "") widgetDisplay.transBuy = langTrans.transBuy;
    if (langTrans.transYouSave != null && langTrans.transYouSave !== "") widgetDisplay.transYouSave = langTrans.transYouSave;
    if (langTrans.transAdd != null && langTrans.transAdd !== "") widgetDisplay.transAdd = langTrans.transAdd;

    var ui = applyWidgetDisplayToRoot(root, widgetDisplay, heading);
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
    var widgetAtcInFlight = false;
    var offrefyAttribution = {
      campaignId: campaign.id,
      productId: root.getAttribute("data-product-id"),
    };
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
        : '<button type="button" class="vd-add-outline" data-vd-tier-add>+ ' +
          esc(ui.transAdd || "Add") +
          "</button>";
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

    function tierForQuantity(qty) {
      if (isVolumeTable) {
        var q = qty | 0;
        if (q < 1) q = 1;
        var bestTier = tiers[0];
        for (var tfx = 0; tfx < tiers.length; tfx++) {
          if (q >= (tiers[tfx].minQty | 0)) bestTier = tiers[tfx];
        }
        return bestTier;
      }
      var checkedTier = mountEl.querySelector('input[name="' + rn + '"]:checked');
      var minQty = checkedTier
        ? parseInt(String(checkedTier.value), 10) || 1
        : tiers[defaultIdx].minQty | 0;
      for (var tix = 0; tix < tiers.length; tix++) {
        if ((tiers[tix].minQty | 0) === minQty) return tiers[tix];
      }
      return tiers[defaultIdx];
    }

    function revenueCentsForAdd(qty) {
      var tier = tierForQuantity(qty);
      var unit = tierUnitCents(currentUnitCents, tier);
      if (
        tier.fixedPricePerUnit != null &&
        tier.fixedPricePerUnit !== undefined
      ) {
        unit = Math.round(Number(tier.fixedPricePerUnit) * 100);
      }
      return unit * Math.max(1, qty | 0);
    }

    function recordAddToCartAnalytics(qty, variantId) {
      syncOffrefyCartAttributes(offrefyAttribution);
      trackAddToCart(
        campaign,
        root.getAttribute("data-product-id"),
        variantId,
        qty,
        revenueCentsForAdd(qty),
      );
    }

    function bindNativeThemeAtcAnalytics() {
      if (root.getAttribute("data-vd-native-atc-bound") === "1") return;
      root.setAttribute("data-vd-native-atc-bound", "1");
      var form = findThemeProductAddForm();
      if (!form) return;
      form.addEventListener(
        "submit",
        function () {
          if (widgetAtcInFlight) return;
          applyOffrefyPropertiesToForm(form, offrefyAttribution);
          var vid =
            readThemeProductFormVariantId() || resolveActiveVariantIdForCart();
          if (!vid) return;
          var qty = readThemeProductFormQuantity(stateQty);
          recordAddToCartAnalytics(qty, vid);
        },
        true,
      );
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
        var strike = card.querySelector("[data-ofd-tier-was]");
        var save = card.querySelector("[data-ofd-tier-save]");
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
            save.textContent = formatYouSaveText(P, currency, ui.transYouSave);
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
      setThemeProductFormQuantity(stateQty);
    }

    function syncFormVariant(vid) {
      var form = findThemeProductAddForm();
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
      var form = findThemeProductAddForm();
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        var btn =
          findThemeAddToCartButton(form) ||
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
      h.push("<th>" + esc(ui.transQty) + "</th>");
      h.push("<th>" + esc(ui.transDiscount) + "</th>");
      h.push("<th>" + esc(ui.transPrice) + "</th>");
      h.push("</tr></thead><tbody>");
      for (var c = 0; c < tiers.length; c++) {
        var d = tiers[c];
        var uInit = tierUnitCents(currentUnitCents, d);
        h.push('<tr class="vd-volume-tier-row">');
        h.push("<td>" + esc(localizedTierBuyLabel(d.buyLabel, c, tiers, ui.transBuy)) + "</td>");
        h.push(
          '<td data-vd-discount-cell>' +
            esc(tierVolumeTableDiscountLabel(d)) +
            "</td>",
        );
        h.push(
          '<td><span class="ofd-tier-amt" data-vd-main-price>' +
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
        h.push('<div class="ofd-tier-row">');
        h.push('<div class="ofd-tier-main">');
        h.push('<span class="vd-radio-circle" aria-hidden="true"></span>');
        h.push('<div class="ofd-tier-copy">');
        h.push('<div class="ofd-tier-label-row">');
        h.push('<span class="ofd-tier-qty">' + esc(localizedTierBuyLabel(d.buyLabel, c2, tiers, ui.transBuy)) + "</span>");
        if (badge && badgePos === "after_label") {
          h.push(tierBadgeHtml(badge, ""));
        }
        h.push("</div>");
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
            '<span class="ofd-tier-save ofd-tier-save--under" data-ofd-tier-save>' +
              esc(formatYouSaveText(P, currency, ui.transYouSave)) +
              "</span>",
          );
        } else {
          h.push('<span class="ofd-tier-save ofd-tier-save--under" data-ofd-tier-save style="display:none"></span>');
        }
        h.push("</div></div>");
        h.push('<div class="ofd-tier-prices">');
        if (badge && badgePos === "price_column") {
          h.push(tierBadgeHtml(badge, "vd-badge-pill--pricecol"));
        }
        if (showStrikeInit && !hideCompareInit) {
          h.push(
            '<span class="ofd-tier-was" data-ofd-tier-was>' +
              fmtMoney(perUnitCardsInit ? currentUnitCents : lt.original, currency) +
              "</span>",
          );
        } else {
          h.push('<span class="ofd-tier-was" data-ofd-tier-was style="display:none"></span>');
        }
        h.push(
          '<span class="ofd-tier-amt" data-vd-main-price>' +
            fmtMoney(perUnitCardsInit ? cardUnitCents : lt.discounted, currency) +
            "</span>",
        );
        h.push("</div></div>");
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

    /* Keep Liquid ATC bridge form across re-mount (lives inside [data-vd-mount]
       so it stays hidden until the widget paints — do not wipe it with innerHTML). */
    var liquidBridge =
      mountEl.querySelector("form[data-vd-liquid-product-form]") ||
      mountEl.querySelector("form.vd-liquid-product-form");
    mountEl.innerHTML = h.join("");
    if (liquidBridge) {
      mountEl.insertBefore(liquidBridge, mountEl.firstChild);
    }

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
        ev.stopPropagation();
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
        widgetAtcInFlight = true;
        addVariantToCart(vidAdd, qtyAdd, ui.ctaButtonAction, offrefyAttribution)
          .then(function () {
            recordAddToCartAnalytics(qtyAdd, vidAdd);
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
            widgetAtcInFlight = false;
          });
      }
    });

    var cta = mountEl.querySelector("[data-vd-cta]");
    if (cta) {
      cta.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
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
        widgetAtcInFlight = true;
        addVariantToCart(vidC, stateQty, ui.ctaButtonAction, offrefyAttribution)
          .then(function () {
            recordAddToCartAnalytics(stateQty, vidC);
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
            widgetAtcInFlight = false;
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
    bindNativeThemeAtcAnalytics();
    trackImpression(campaign, root.getAttribute("data-product-id"));
    window.VolumeDiscount = window.VolumeDiscount || {};
    window.VolumeDiscount.embed = window.VolumeDiscount.embed || {};
    window.VolumeDiscount.embed.version = "1.28.3";

  }
  /**
   * Compact product metafield `volume_discount.tiers` written on sync.
   * Used when shop metafield is in per_product mode (large catalogs) so the
   * widget can paint without waiting on /widget-config.
   */
  function expandCompactProductRule(rule) {
    if (!rule || typeof rule !== "object") return null;
    var rawTiers = Array.isArray(rule.t) ? rule.t : [];
    if (!rawTiers.length) return null;
    var tiers = [];
    for (var i = 0; i < rawTiers.length; i++) {
      var t = rawTiers[i];
      if (!t || typeof t !== "object") continue;
      var minQty = Math.max(1, Math.floor(Number(t.m) || 1));
      var tier = {
        minQty: minQty,
        buyLabel: "Buy " + minQty + (i === 0 ? "" : "+"),
        badge: null,
        activeByDefault: i === 0,
        optionSubtext: "",
      };
      if (t.p != null && t.p !== undefined) {
        tier.percent = Math.min(100, Math.max(0, Number(t.p)));
      } else if (t.fp != null && t.fp !== undefined) {
        tier.fixedPricePerUnit = Number(t.fp);
      } else if (t.f != null && t.f !== undefined) {
        tier.fixedAmount = Number(t.f);
        tier.appliesToEachItem = t.e === 1 || t.e === true;
      } else {
        continue;
      }
      tiers.push(tier);
    }
    if (!tiers.length) return null;
    return {
      id: String(rule.c || "_product_rule"),
      campaignName: String(rule.m || "Volume discount"),
      displayName: String(rule.m || "Volume discount"),
      productScope: "all",
      quantityCondition:
        rule.q === "a"
          ? "total-all"
          : rule.q === "c"
            ? "per-collection"
            : rule.q === "p"
              ? "per-product"
              : "per-variant",
      customerType: "everyone",
      customerTags: [],
      productIds: [],
      tiers: tiers,
      widgetDisplay: {},
    };
  }

  function readCompactProductRule(root) {
    var el = root && root.querySelector("script[data-vd-product-rule]");
    if (!el) return null;
    try {
      return expandCompactProductRule(JSON.parse(String(el.textContent || "").trim()));
    } catch (e) {
      return null;
    }
  }

  function runWidget(root) {
    if (root.getAttribute("data-vd-inited") === "1") return;
    var configId = root.getAttribute("data-config-id");
    var mount = root.querySelector("[data-vd-mount]");
    var scriptEl = configId ? document.getElementById(configId) : null;
    if (!mount) return;

    var designModeEarly = root.getAttribute("data-design-mode") === "true";
    var productId = root.getAttribute("data-product-id");
    if (!productId) {
      /* Theme editor on Home / non-product: still show a preview so Apps picker works. */
      if (designModeEarly) {
        root.setAttribute("data-product-id", "0");
        root.setAttribute("data-variant-id", "0");
        root.setAttribute("data-unit-price-cents", "2500");
        root.setAttribute(
          "data-currency",
          root.getAttribute("data-currency") || "USD",
        );
        runWidget(root);
        return;
      }
      hydrateRootProductDataFromJson(root).then(function (ok) {
        if (ok) runWidget(root);
        else mount.hidden = true;
      });
      return;
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
    var productRuleCampaign = readCompactProductRule(root);

    if (!productId) {
      mount.hidden = true;
      return;
    }
    if (!unitCents || unitCents < 1) {
      if (designMode) {
        unitCents = 2500;
      } else {
        /* Hyper / markets sometimes omit Liquid price — hydrate from /products/*.js */
        hydrateRootProductDataFromJson(root, { forcePrice: true }).then(
          function (ok) {
            if (!ok) {
              mount.hidden = true;
              return;
            }
            root.removeAttribute("data-vd-inited");
            runWidget(root);
          },
        );
        return;
      }
    }

    function applyConfig(cfg) {
      var camp = pickCampaign(cfg, productId, variantId, productGid, variantGid);
      if (!camp || !camp.tiers || !camp.tiers.length) {
        camp = productRuleCampaign;
      }
      if ((!camp || !camp.tiers || !camp.tiers.length) && designMode) {
        camp = {
          id: "_preview",
          campaignName: "Preview",
          productScope: "all",
          tiers: [
            { minQty: 1, buyLabel: "Buy 1", badge: "Most Popular ⚡", activeByDefault: true, percent: 0 },
            { minQty: 3, buyLabel: "Buy 3+", badge: null, activeByDefault: false, percent: 10 },
            { minQty: 5, buyLabel: "Buy 5+", badge: null, activeByDefault: false, percent: 15 },
          ],
          widgetDisplay: WD_DEFAULT,
        };
      }
      if (!camp || !camp.tiers || !camp.tiers.length) {
        root.style.display = "none";
        return;
      }
      if (cfg && cfg.translations) {
        camp.translations = cfg.translations;
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

    var rawInline = parseInline(scriptEl);
    var inline = sanitizeWidgetConfig(rawInline, designMode);
    if (rawInline && rawInline.translations) {
      inline.translations = rawInline.translations;
      rememberStorefrontTranslations(rawInline.translations);
    }

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

    if ((!matched || !matched.tiers || !matched.tiers.length) && productRuleCampaign) {
      matched = productRuleCampaign;
    }

    if (matched && matched.tiers && matched.tiers.length) {
      if (inline && inline.translations) {
        matched.translations = inline.translations;
      }
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

    function finishFetch(remote) {
      if (!root.isConnected) return;
      if (root.getAttribute("data-vd-inited") === "1") return;
      var cfg = sanitizeWidgetConfig(
        remote || { version: 1, campaigns: [] },
        designMode,
      );
      if (remote && remote.translations) {
        cfg.translations = remote.translations;
        rememberStorefrontTranslations(remote.translations);
      }
      if (scriptEl && cfg && cfg.campaigns) {
        try {
          scriptEl.textContent = JSON.stringify(cfg);
        } catch (e) {
          void e;
        }
      }
      applyConfig(cfg);
    }

    fetchConfig(productId, variantId).then(finishFetch);
  }

  function ensureHostedStorefrontCss() {
    if (document.querySelector('link[data-vd-hosted-css="1"]')) return;
    if (document.querySelector('link[href*="volume-discount-storefront.css"]')) return;
    var origin =
      (typeof window.__vdAppOrigin === "string" && window.__vdAppOrigin) ||
      "https://offrey.xloxi.com";
    var ver =
      (typeof window.__vdAssetVersion === "string" && window.__vdAssetVersion) ||
      "1.24.0";
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      String(origin).replace(/\/$/, "") +
      "/vd-storefront.css?v=" +
      encodeURIComponent(ver);
    link.setAttribute("data-vd-hosted-css", "1");
    (document.head || document.documentElement).appendChild(link);
  }

  function isLikelyProductPage() {
    try {
      if (/\/products\/[^/?#]+/i.test(String(location.pathname || ""))) return true;
    } catch (e) {
      void e;
    }
    try {
      if (
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.product
      ) {
        return true;
      }
    } catch (e2) {
      void e2;
    }
    if (document.querySelector('form[action*="/cart/add"]')) return true;
    return false;
  }

  /**
   * Autoinject disabled: widget only mounts where the merchant added the
   * “Quantity breaks” theme block. App embed loads scripts/CSS only.
   */
  function ensureAutoinjectRoot() {
    return null;
  }

  function hideAllWidgetRoots() {
    document.querySelectorAll(".vd-storefront-root").forEach(function (el) {
      el.style.display = "none";
      el.removeAttribute("data-vd-inited");
      var mount = el.querySelector("[data-vd-mount]");
      if (mount) mount.hidden = true;
    });
  }

  function scan(options) {
    var opts = options || {};
    var syncCartSideEffects = opts.syncCart !== false;

    /* App embed off → never mount (block markup alone must not show the widget). */
    if (!window.__vdAppEmbedActive) {
      hideAllWidgetRoots();
      return;
    }

    /* Widget first — never wait on cart network before mounting. */
    document.querySelectorAll(".vd-storefront-root").forEach(function (el) {
      runWidget(el);
    });

    installCartMutationInterceptor();
    bindCartDrawerDiscountLabelPatching();
    bindStorefrontLocaleWatcher();
    vdLastKnownStorefrontLocale = resolveStorefrontLocale(null) || "en";
    refreshCartBadgeTemplatesForLocale();
    try {
      var storedLocale = sessionStorage.getItem("vd_locale_attr");
      if (storedLocale && !vdLastSyncedCartLocale) {
        vdLastSyncedCartLocale = storedLocale;
      }
    } catch (e) {
      void e;
    }

    function runCartSideEffects() {
      if (syncCartSideEffects) {
        syncCartLocaleAttribute(false)
          .then(function () {
            return syncCartLockedProductsAttribute(null);
          })
          .then(function () {
            scheduleCartDrawerDiscountLabelPatch();
          });
      } else {
        scheduleCartDrawerDiscountLabelPatch();
      }
    }

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runCartSideEffects, { timeout: 2000 });
    } else {
      setTimeout(runCartSideEffects, syncCartSideEffects ? 400 : 0);
    }
  }

  /* Defer script runs after parse — mount immediately when roots exist. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      scan({ syncCart: true });
    });
  } else {
    scan({ syncCart: true });
  }
  /* Section remounts only need widget roots — avoid cart/update storm on every variant section swap. */
  document.addEventListener("shopify:section:load", function () {
    scan({ syncCart: false });
  });
})();

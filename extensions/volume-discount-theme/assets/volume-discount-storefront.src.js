"use strict";
(function () {
  "use strict";

  /** Single Offrefy namespace — never pollute window with generic globals. */
  function offrefyNs() {
    var o = window.Offrefy;
    if (!o || typeof o !== "object") {
      o = {};
      try {
        Object.defineProperty(window, "Offrefy", {
          value: o,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      } catch (e) {
        window.Offrefy = o;
      }
    }
    return o;
  }

  /** Quiet in production; prefix all logs with [Offrefy]. */
  function offrefyLog() {
    try {
      if (window.Shopify && window.Shopify.designMode) {
        var args = ["[Offrefy]"].concat([].slice.call(arguments));
        if (typeof console !== "undefined" && console.log) console.log.apply(console, args);
      }
    } catch (e) {
      void e;
    }
  }

  function offrefyWarn() {
    try {
      var args = ["[Offrefy]"].concat([].slice.call(arguments));
      if (typeof console !== "undefined" && console.warn) console.warn.apply(console, args);
    } catch (e) {
      void e;
    }
  }

  /* One-time migrate legacy __xloxi* flags from older asset snippets. */
  (function migrateLegacyOffrefyGlobals() {
    var o = offrefyNs();
    var legacy = [
      ["appEmbedActive", "__xloxiAppEmbedActive"],
      ["configRev", "__xloxiConfigRev"],
      ["appOrigin", "__xloxiAppOrigin"],
      ["assetVersion", "__xloxiAssetVersion"],
      ["configPrefetchKey", "__xloxiConfigPrefetchKey"],
      ["configPrefetch", "__xloxiConfigPrefetch"],
      ["customer", "__xloxiCustomer"],
      ["storefrontTranslations", "__xloxiStorefrontTranslations"],
      ["cartBadgeTemplates", "__xloxiCartBadgeTemplates"],
      ["storefrontLocale", "__xloxiStorefrontLocale"],
      ["maxDiscountProducts", "__xloxiMaxDiscountProducts"],
      ["storefrontAssetsLoaded", "__xloxiStorefrontAssetsLoaded"],
    ];
    for (var i = 0; i < legacy.length; i++) {
      var key = legacy[i][0];
      var old = legacy[i][1];
      try {
        if (o[key] === undefined && typeof window[old] !== "undefined") {
          o[key] = window[old];
        }
      } catch (e) {
        void e;
      }
    }
  })();

  /** Registry for Theme Editor unload / multi-instance teardown. */
  var offrefyRuntime = offrefyNs();
  if (!offrefyRuntime._teardown) offrefyRuntime._teardown = [];
  if (!offrefyRuntime._instances) offrefyRuntime._instances = new Map();

  function offrefyRegisterTeardown(fn) {
    if (typeof fn !== "function") return;
    offrefyRuntime._teardown.push(fn);
  }

  function offrefyRunTeardown() {
    var list = offrefyRuntime._teardown.splice(0, offrefyRuntime._teardown.length);
    for (var i = 0; i < list.length; i++) {
      try {
        list[i]();
      } catch (e) {
        offrefyWarn("teardown", e);
      }
    }
    try {
      document.documentElement.removeAttribute("data-offrefy-hide-theme-variant");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-qty");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-atc");
      document.documentElement.removeAttribute("data-offrefy-hide-theme-buy");
    } catch (e2) {
      void e2;
    }
  }

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
      offrefyNs().configRev != null ? String(offrefyNs().configRev) : "";
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
      offrefyNs().configRev != null ? String(offrefyNs().configRev) : "";
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
      typeof offrefyNs().appOrigin === "string"
        ? String(offrefyNs().appOrigin).replace(/\/$/, "")
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

    var prefetchKey = offrefyNs().configPrefetchKey;
    var prefetchPromise =
      prefetchKey &&
      prefetchKey === key &&
      offrefyNs().configPrefetch &&
      typeof offrefyNs().configPrefetch.then === "function"
        ? offrefyNs().configPrefetch.then(function (body) {
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
    var existing = form.querySelectorAll("[data-offrefy-prop]");
    for (var ei = 0; ei < existing.length; ei++) {
      existing[ei].remove();
    }
    for (var key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = "properties[" + key + "]";
      input.value = props[key];
      input.setAttribute("data-offrefy-prop", "1");
      form.appendChild(input);
    }
  }

  /**
   * Do not write Offrefy keys onto cart attributes — they become order
   * "Additional details". Attribution stays on private line item properties
   * (`_offrefy*`) plus analytics events.
   */
  function syncOffrefyCartAttributes() {
    return Promise.resolve();
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

  function customerAllowsCampaign(campaign) {
    var ct = String((campaign && campaign.customerType) || "everyone");
    if (ct === "everyone" || !ct) return true;
    var cust = offrefyNs().customer || {};
    var loggedIn = cust.loggedIn === true;
    if (ct === "logged-in") return loggedIn;
    if (ct === "logged-in-tag-any") {
      if (!loggedIn) return false;
      var need = Array.isArray(campaign.customerTags) ? campaign.customerTags : [];
      if (!need.length) return false;
      var have = Array.isArray(cust.tags) ? cust.tags : [];
      var set = {};
      for (var i = 0; i < have.length; i++) set[String(have[i])] = true;
      for (var j = 0; j < need.length; j++) {
        if (set[String(need[j])]) return true;
      }
      return false;
    }
    return true;
  }

  function campaignInScheduleWindow(campaign) {
    var now = Date.now();
    // Scheduled: hide until start. After end: hide. Active window: show.
    if (campaign && campaign.countdownStartsAt != null) {
      var startMs = Date.parse(String(campaign.countdownStartsAt));
      if (!isNaN(startMs) && now < startMs) return false;
    }
    if (campaign && campaign.countdownEndsAt != null) {
      var endMs = Date.parse(String(campaign.countdownEndsAt));
      if (!isNaN(endMs) && now >= endMs) return false;
    }
    return true;
  }

  /** Product-rule / campaign must pass customer + schedule gates before painting. */
  function campaignUsableOnStorefront(campaign) {
    if (!campaign) return false;
    // Legacy product metafields (no sv/sa) must not early-paint — Scheduled
    // offers were incorrectly shown before /widget-config filtered them out.
    if (campaign._fromProductRule && !campaign._scheduleAware) return false;
    return (
      customerAllowsCampaign(campaign) && campaignInScheduleWindow(campaign)
    );
  }

  function pickCampaign(cfg, productId, variantId, productGid, variantGid) {
    var list = (cfg && cfg.campaigns) || [];
    for (var i = 0; i < list.length; i++) {
      if (!campaignInScheduleWindow(list[i])) continue;
      if (!customerAllowsCampaign(list[i])) continue;
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
      offrefyNs().storefrontTranslations = transMap;
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

  function adaptCartBadgeTemplateForLocale(englishTemplate, localeTemplate, locale) {
    var en = String(englishTemplate || "").trim();
    var loc = String(localeTemplate || "").trim();
    if (!en || !loc) return loc;
    var wantsAmount = /\{\{\s*amount\s*\}\}/i.test(en);
    var wantsDiscount = /\{\{\s*discount\s*\}\}/i.test(en);
    if (wantsAmount && !wantsDiscount && /\{\{\s*discount\s*\}\}/i.test(loc) && !/\{\{\s*amount\s*\}\}/i.test(loc)) {
      return loc.replace(/\{\{\s*discount\s*\}\}/gi, "{{ amount }}");
    }
    if (wantsDiscount && !wantsAmount && /\{\{\s*amount\s*\}\}/i.test(loc) && !/\{\{\s*discount\s*\}\}/i.test(loc)) {
      return loc.replace(/\{\{\s*amount\s*\}\}/gi, "{{ discount }}");
    }
    return loc;
  }

  function resolveCartBadgeTemplates() {
    var locale = resolveStorefrontLocale(null) || "en";
    var fromWindow = offrefyNs().cartBadgeTemplates;
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

    var transMap = offrefyNs().storefrontTranslations || {};
    var entry = transMap[locale] || {};
    var enCart =
      transMap.en &&
      transMap.en.transCartDiscount &&
      String(transMap.en.transCartDiscount).trim();
    var preset = CART_BADGE_JS_FALLBACKS[locale];
    var discount =
      entry.transCartDiscount && String(entry.transCartDiscount).trim()
        ? String(entry.transCartDiscount).trim()
        : preset && preset.discount
          ? preset.discount
          : "{{ discount }} OFF";
    if (locale !== "en" && enCart) {
      discount = adaptCartBadgeTemplateForLocale(enCart, discount, locale);
    }
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
    offrefyNs().cartBadgeTemplates = {
      locale: locale,
      discount: templates.discount,
      qty: templates.qty,
    };
    return templates;
  }

  function formatLocalizedCartBadgeLabel(percent, qty, amountLabel) {
    var templates = resolveCartBadgeTemplates();
    var core = String(templates.discount || "{{ discount }} OFF");
    var hasAmountPh = /\{\{\s*amount\s*\}\}/i.test(core);
    var hasDiscountPh = /\{\{\s*discount\s*\}\}/i.test(core);
    if (hasAmountPh && amountLabel) {
      core = core.replace(/\{\{\s*amount\s*\}\}/gi, String(amountLabel));
    }
    if (hasDiscountPh && percent) {
      core = core.replace(/\{\{\s*discount\s*\}\}/gi, String(percent) + "%");
    }
    core = core
      .replace(/\{\{\s*amount\s*\}\}/gi, "")
      .replace(/\{\{\s*discount\s*\}\}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!core) return "";
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
    // Only rewrite legacy English Function labels (e.g. "25% OFF").
    // Never touch locale labels, money labels, or unfilled templates.
    if (s.length < 3 || s.length > 80) return false;
    if (/\{\{/.test(s)) return false;
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
      if (next && next !== text) node.textContent = next;
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
    if (offrefyNs().cartBadgePatchBound) return;
    offrefyNs().cartBadgePatchBound = true;
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
        if (drawer.getAttribute("data-offrefy-open-watch") === "1") return;
        drawer.setAttribute("data-offrefy-open-watch", "1");
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
    offrefyNs().storefrontLocale = next;
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
    if (offrefyNs().localeWatchBound) return;
    offrefyNs().localeWatchBound = true;
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
                'a[href], button[data-locale], [data-language], .disclosure__link',
              )
            : null;
        if (!link) return;
        /* Never treat product qty +/- (or other data-value controls) as locale switches —
           that fired cart/update.js and reset theme quantity steppers. */
        if (
          link.closest &&
          (link.closest("quantity-input") ||
            link.closest(".quantity") ||
            link.closest(".product-form__quantity") ||
            link.closest("[data-quantity-selector]") ||
            link.getAttribute("name") === "plus" ||
            link.getAttribute("name") === "minus" ||
            link.getAttribute("name") === "increase")
        ) {
          return;
        }
        var href = String(link.getAttribute("href") || "");
        if (href) {
          var pathOnly = href.replace(/^https?:\/\/[^/]+/i, "");
          var pathLocale = localeCodeFromPathPrefix(pathOnly);
          if (pathLocale) {
            offrefyNs().storefrontLocale = pathLocale;
            vdLastKnownStorefrontLocale = "";
            setTimeout(handleStorefrontLocaleChange, 0);
            setTimeout(handleStorefrontLocaleChange, 400);
            setTimeout(refreshCartDrawerForLocaleChange, 700);
          }
        }
        var dataLocale =
          link.getAttribute("data-locale") ||
          link.getAttribute("data-language");
        if (dataLocale) {
          offrefyNs().storefrontLocale = normalizeLocaleCode(dataLocale);
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
      transBuy: root.getAttribute("data-offrefy-trans-buy") || "",
      transYouSave: root.getAttribute("data-offrefy-trans-you-save") || "",
      transAdd: root.getAttribute("data-offrefy-trans-add") || "",
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
    var id = root.getAttribute("data-offrefy-cd-iv");
    if (id) {
      clearInterval(parseInt(id, 10));
      root.removeAttribute("data-offrefy-cd-iv");
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

    if (typeof offrefyNs().storefrontLocale === "string" && offrefyNs().storefrontLocale) {
      return normalizeLocaleCode(offrefyNs().storefrontLocale);
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
  var VD_LOCKED_SESSION_KEY = "vd_locked_products";
  /** Legacy cart keys that surface on Shopify admin order Additional details. */
  var VD_ORDER_VISIBLE_CART_ATTRS = [
    VD_CART_LOCALE_ATTR,
    VD_LOCKED_PRODUCTS_ATTR,
    OFFREFY_CART_FLAG_ATTR,
    OFFREFY_CART_CAMPAIGN_ATTR,
    OFFREFY_CART_PRODUCT_ATTR,
  ];
  var VD_MAX_DISCOUNT_PRODUCTS_STANDARD = 500;
  var vdLastSyncedCartLocale = "";
  var vdLastSyncedLockedProducts = "";
  var vdCachedMaxDiscountProducts = VD_MAX_DISCOUNT_PRODUCTS_STANDARD;
  var vdLegacyCartAttrClearInFlight = null;
  var vdLegacyCartAttrsCleared = false;

  function readLockedProductsSession() {
    try {
      return String(sessionStorage.getItem(VD_LOCKED_SESSION_KEY) || "");
    } catch (e) {
      void e;
      return "";
    }
  }

  function writeLockedProductsSession(value) {
    try {
      var s = String(value || "");
      if (s) sessionStorage.setItem(VD_LOCKED_SESSION_KEY, s);
      else sessionStorage.removeItem(VD_LOCKED_SESSION_KEY);
    } catch (e) {
      void e;
    }
  }

  /** Strip app cart attributes so they never copy onto new orders. */
  function clearOrderVisibleVdCartAttributes(cart) {
    if (vdLegacyCartAttrsCleared) return Promise.resolve(cart || null);
    if (vdLegacyCartAttrClearInFlight) {
      return vdLegacyCartAttrClearInFlight.then(function () {
        return cart || null;
      });
    }

    function hasLegacy(attrs) {
      if (!attrs || typeof attrs !== "object") return false;
      for (var i = 0; i < VD_ORDER_VISIBLE_CART_ATTRS.length; i++) {
        var key = VD_ORDER_VISIBLE_CART_ATTRS[i];
        if (attrs[key] != null && String(attrs[key]).length) return true;
      }
      return false;
    }

    var work = (
      cart
        ? Promise.resolve(cart)
        : fetch(cartJsUrl(), {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          })
            .then(function (r) {
              return r.ok ? r.json() : null;
            })
            .catch(function () {
              return null;
            })
    ).then(function (c) {
      if (!c || !hasLegacy(c.attributes)) {
        vdLegacyCartAttrsCleared = true;
        return c;
      }
      /* migrate locked list into session before wiping cart attr */
      try {
        var legacyLocked = String(
          (c.attributes && c.attributes[VD_LOCKED_PRODUCTS_ATTR]) || "",
        );
        if (legacyLocked && !readLockedProductsSession()) {
          writeLockedProductsSession(legacyLocked);
          vdLastSyncedLockedProducts = legacyLocked;
        }
      } catch (eMig) {
        void eMig;
      }
      var attrs = {};
      for (var j = 0; j < VD_ORDER_VISIBLE_CART_ATTRS.length; j++) {
        attrs[VD_ORDER_VISIBLE_CART_ATTRS[j]] = "";
      }
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
          vdLegacyCartAttrsCleared = true;
          return c;
        })
        .catch(function () {
          return c;
        });
    });

    vdLegacyCartAttrClearInFlight = work.then(
      function (result) {
        if (vdLegacyCartAttrClearInFlight === work) {
          vdLegacyCartAttrClearInFlight = null;
        }
        return result;
      },
      function (err) {
        if (vdLegacyCartAttrClearInFlight === work) {
          vdLegacyCartAttrClearInFlight = null;
        }
        throw err;
      },
    );
    return vdLegacyCartAttrClearInFlight;
  }

  function resolveMaxDiscountProducts(cfg) {
    if (
      cfg &&
      typeof cfg.maxDiscountProducts === "number" &&
      cfg.maxDiscountProducts > 0
    ) {
      return cfg.maxDiscountProducts | 0;
    }
    if (typeof offrefyNs().maxDiscountProducts === "number" && offrefyNs().maxDiscountProducts > 0) {
      return offrefyNs().maxDiscountProducts | 0;
    }
    return vdCachedMaxDiscountProducts > 0
      ? vdCachedMaxDiscountProducts
      : VD_MAX_DISCOUNT_PRODUCTS_STANDARD;
  }

  function rememberMaxDiscountProducts(cfg) {
    var n = resolveMaxDiscountProducts(cfg);
    if (n > 0) {
      vdCachedMaxDiscountProducts = n;
      offrefyNs().maxDiscountProducts = n;
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
    var lockedRaw = readLockedProductsSession();
    if (
      !lockedRaw &&
      cart.attributes &&
      cart.attributes[VD_LOCKED_PRODUCTS_ATTR]
    ) {
      lockedRaw = String(cart.attributes[VD_LOCKED_PRODUCTS_ATTR] || "");
    }
    var locked = parseLockedProductIds(lockedRaw, max);
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

  /** Keep discount slots stable in sessionStorage (not cart — avoids order Additional details). */
  var vdLockedSyncInFlight = null;
  function syncCartLockedProductsAttribute(cart) {
    if (!cart && vdLockedSyncInFlight) return vdLockedSyncInFlight;

    var work = cart
      ? Promise.resolve(cart)
      : fetch(cartJsUrl(), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .catch(function () {
            return null;
          });

    var promise = work.then(function (c) {
      if (!c) return null;
      if (!vdLastSyncedLockedProducts) {
        vdLastSyncedLockedProducts = readLockedProductsSession();
      }
      var next = computeLockedProductIds(c);
      var nextStr = next.join(",");
      if (nextStr !== vdLastSyncedLockedProducts) {
        vdLastSyncedLockedProducts = nextStr;
        writeLockedProductsSession(nextStr);
      }
      return clearOrderVisibleVdCartAttributes(c).then(function () {
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

  /** Persist storefront locale in sessionStorage only (never cart / order notes). */
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
    return clearOrderVisibleVdCartAttributes(null).then(function () {});
  }

  function cartJsUrl() {
    return shopifyRoutesRoot() + "cart.js";
  }

  function checkoutUrlHref() {
    return window.location.origin + "/checkout";
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

  /**
   * After a language switch: never request Cart API `sections`.
   * Themes (Valor/Dawn) intercept cart/update.js and inject section HTML; missing
   * section keys become the literal text "undefined" in the cart title / icon bubble.
   * Locale attr is already synced via syncCartLocaleAttribute — only repair counts + badges.
   */
  function refreshCartDrawerForLocaleChange() {
    return fetch(cartJsUrl(), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (cart) {
        if (cart) updateCartCountBubbles(cart);
        scheduleCartDrawerDiscountLabelPatch();
        return cart;
      })
      .catch(function () {
        scheduleCartDrawerDiscountLabelPatch();
        return null;
      });
  }

  function updateCartCountBubbles(cart) {
    var count =
      cart && typeof cart.item_count === "number" ? cart.item_count | 0 : 0;
    var countLabel = count < 100 ? String(count) : "99+";
    try {
      var valor = document.querySelector("valor-cart-drawer");
      if (valor && typeof valor.updateCartCount === "function") {
        valor.updateCartCount({ item_count: count });
      }
    } catch (eV) {
      void eV;
    }
    /* Repair "Votre panier (undefined)" / similar title count after a bad section inject. */
    try {
      var titleEls = document.querySelectorAll(
        "cart-drawer .drawer__heading, cart-drawer .cart-drawer__heading, cart-drawer h2, valor-cart-drawer h2, #CartDrawer h2, [data-cart-title]",
      );
      for (var ti = 0; ti < titleEls.length; ti++) {
        var titleText = String(titleEls[ti].textContent || "");
        if (titleText.indexOf("undefined") === -1) continue;
        titleEls[ti].textContent = titleText.replace(/\bundefined\b/g, countLabel);
      }
    } catch (eTitle) {
      void eTitle;
    }
    /* Valor header badge */
    try {
      var cartLink = document.querySelector(".valor-header__cart");
      if (cartLink) {
        var bubble = cartLink.querySelector(".valor-cart-count");
        var hiddenText = cartLink.querySelector("[data-cart-count-text]");
        if (count > 0) {
          if (!bubble) {
            bubble = document.createElement("span");
            bubble.className = "valor-cart-count";
            bubble.setAttribute("aria-hidden", "true");
            if (hiddenText) cartLink.insertBefore(bubble, hiddenText);
            else cartLink.appendChild(bubble);
          }
          bubble.textContent = countLabel;
        } else if (bubble) {
          bubble.remove();
        }
        if (hiddenText && hiddenText.dataset && hiddenText.dataset.template) {
          hiddenText.textContent = String(hiddenText.dataset.template).replace(
            "%count%",
            String(count),
          );
        }
      }
    } catch (eValorBadge) {
      void eValorBadge;
    }
    /* Dawn-style bubbles + stray "undefined" near the cart icon */
    try {
      var dawnBubbles = document.querySelectorAll(
        ".cart-count-bubble span[aria-hidden='true'], .cart-count-bubble span:not(.visually-hidden), [data-cart-count], .header__icon--cart .cart-count, .valor-cart-count",
      );
      for (var i = 0; i < dawnBubbles.length; i++) {
        if (count > 0) {
          dawnBubbles[i].textContent = countLabel;
        } else {
          dawnBubbles[i].textContent = "";
        }
      }
      /* Loose text nodes / spans the theme left as the word undefined */
      var loose = document.querySelectorAll(
        ".valor-header__cart, .header__icon--cart, #cart-icon-bubble",
      );
      for (var li = 0; li < loose.length; li++) {
        var walker = document.createTreeWalker(
          loose[li],
          NodeFilter.SHOW_TEXT,
          null,
        );
        var node;
        while ((node = walker.nextNode())) {
          if (String(node.textContent || "").trim() === "undefined") {
            node.textContent = count > 0 ? countLabel : "";
          }
        }
      }
    } catch (eDawn) {
      void eDawn;
    }
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
      document.dispatchEvent(
        new CustomEvent("valor:cart:updated", {
          bubbles: true,
          detail: cartData || {},
        }),
      );
    } catch (e2) {
      void e2;
    }
    updateCartCountBubbles(cartData);
  }

  function findVdLiquidProductForm(root) {
    var el = root || document.querySelector(".offrefy-root");
    if (el) {
      var id = el.getAttribute("data-offrefy-product-form-id");
      if (id) {
        var byId = document.getElementById(id);
        if (byId) return byId;
      }
      var inRoot =
        el.querySelector("form[data-offrefy-liquid-product-form]") ||
        el.querySelector("form.offrefy-liquid-product-form");
      if (inRoot) return inRoot;
    }
    return (
      document.querySelector("form[data-offrefy-liquid-product-form]") ||
      document.querySelector("form.offrefy-liquid-product-form")
    );
  }

  function syncVdLiquidProductForm(form, variantId, quantity, attribution) {
    if (!form) return false;
    var vid = String(variantId || "");
    var qty = parseInt(String(quantity), 10) || 1;
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var idInput = form.querySelector("[data-offrefy-liquid-variant-id]");
    if (idInput) {
      /* Arm names only when syncing for submit — keeps theme qty/variant querySelectors clean. */
      idInput.setAttribute("name", "id");
      if (vid) idInput.value = vid;
    }
    var qtyInput = form.querySelector("[data-offrefy-liquid-qty]");
    if (qtyInput) {
      qtyInput.setAttribute("name", "quantity");
      qtyInput.value = String(qty);
    }
    var submitBtn = form.querySelector("[data-offrefy-liquid-submit]");
    if (submitBtn) submitBtn.setAttribute("name", "add");
    applyOffrefyPropertiesToForm(form, attribution);
    return true;
  }

  /**
   * Theme product form (not the Offrefy liquid bridge).
   * Example: form[action*="/cart/add"]
   */
  function findThemeProductCartForm() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (!form) continue;
      if (
        form.hasAttribute("data-offrefy-liquid-product-form") ||
        (form.classList && form.classList.contains("offrefy-liquid-product-form"))
      ) {
        continue;
      }
      if (form.closest(".offrefy-root")) continue;
      if (
        form.closest(
          "cart-drawer, cart-notification, #CartDrawer, .cart-drawer, cart-items, #main-cart-items",
        )
      ) {
        continue;
      }
      /* Payment-terms / wallet stubs are not the main ATC form. */
      if (
        (form.classList && form.classList.contains("valor-product-payment-terms__form")) ||
        (form.id && String(form.id).indexOf("payment-terms") !== -1)
      ) {
        continue;
      }
      var score = 0;
      if (form.querySelector('[name="id"]')) score += 3;
      if (
        form.querySelector(
          'button[type="submit"][name="add"], button[name="add"], [data-add-button]',
        )
      ) {
        score += 8;
      } else if (
        form.querySelector(
          'button[type="submit"], [type="submit"], input[name="add"]',
        )
      ) {
        score += 4;
      }
      if (
        form.classList &&
        (form.classList.contains("valor-mp__form") ||
          form.classList.contains("product-form") ||
          form.classList.contains("form"))
      ) {
        score += 4;
      }
      if (form.id && String(form.id).indexOf("product-form") !== -1) score += 5;
      if (
        form.closest(
          "product-info, .product, [id^='MainProduct'], .product-form, .product__info, .valor-mp__buy",
        )
      ) {
        score += 6;
      }
      if (score > bestScore) {
        bestScore = score;
        best = form;
      }
    }
    return best;
  }

  /** Example: form[action*="/cart/add"] [type="submit"] */
  function findThemeCartAddSubmitButton(form) {
    if (!form) return null;
    return (
      form.querySelector('button[type="submit"][name="add"]') ||
      form.querySelector("button[data-add-button]") ||
      form.querySelector('button[name="add"]') ||
      form.querySelector('input[type="submit"][name="add"]') ||
      form.querySelector("button.product-form__submit") ||
      form.querySelector('button[type="submit"]') ||
      form.querySelector('[type="submit"]')
    );
  }

  function isOffrefyOwnedNode(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest("[data-offrefy-root]") ||
      el.closest(".offrefy-liquid-product-form") ||
      el.closest("[data-offrefy-liquid-product-form]") ||
      el.classList.contains("offrefy-cta") ||
      el.classList.contains("offrefy-liquid-submit")
    );
  }

  function themeCartAddForms() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    var out = [];
    for (var i = 0; i < forms.length; i++) {
      if (isOffrefyOwnedNode(forms[i])) continue;
      out.push(forms[i]);
    }
    return out;
  }

  function markThemeHidden(el) {
    if (!el || isOffrefyOwnedNode(el)) return;
    if (el.getAttribute("data-offrefy-theme-hidden") === "1") return;
    el.setAttribute("data-offrefy-theme-hidden", "1");
    el.style.setProperty("display", "none", "important");
  }

  function clearThemeHidden(scope) {
    var root = scope || document;
    var nodes = root.querySelectorAll
      ? root.querySelectorAll("[data-offrefy-theme-hidden='1']")
      : [];
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].style.removeProperty("display");
      nodes[i].removeAttribute("data-offrefy-theme-hidden");
    }
  }

  function collectThemeAtcButtons(form) {
    var found = [];
    function add(el) {
      if (!el || isOffrefyOwnedNode(el)) return;
      if (el.closest && el.closest(".shopify-payment-button")) return;
      if (el.closest && el.closest("shopify-accelerated-checkout")) return;
      if (el.getAttribute && el.getAttribute("name") === "checkout") return;
      for (var s = 0; s < found.length; s++) {
        if (found[s] === el) return;
      }
      found.push(el);
    }
    var sels = [
      'button[type="submit"][name="add"]',
      'button[name="add"]',
      'input[type="submit"][name="add"]',
      "button.product-form__submit",
      "button.product-form__cart-submit",
      "[data-add-to-cart]",
      "[data-add-button]",
      ".add-to-cart",
      ".product-form__buttons > button[type='submit']",
    ];
    for (var i = 0; i < sels.length; i++) {
      var list = form.querySelectorAll(sels[i]);
      for (var j = 0; j < list.length; j++) add(list[j]);
    }
    var primary = findThemeCartAddSubmitButton(form);
    if (primary) add(primary);
    return found;
  }

  function themeProductScopes() {
    var scopes = [];
    function addScope(el) {
      if (!el || isOffrefyOwnedNode(el)) return;
      for (var i = 0; i < scopes.length; i++) {
        if (scopes[i] === el) return;
      }
      scopes.push(el);
    }
    var forms = themeCartAddForms();
    for (var f = 0; f < forms.length; f++) {
      addScope(forms[f]);
      addScope(
        forms[f].closest("product-info") ||
          forms[f].closest("[data-product-info]") ||
          forms[f].closest(".product__info-container") ||
          forms[f].closest(".product__info-wrapper") ||
          forms[f].closest(".product-information") ||
          forms[f].closest(".product-details") ||
          forms[f].closest(".product-single") ||
          forms[f].closest(".product") ||
          forms[f].closest(".shopify-section") ||
          forms[f].parentElement,
      );
    }
    var extras = document.querySelectorAll(
      "product-info, .shopify-section--main-product, [data-product-info], .product__info-container, .product-information",
    );
    for (var e = 0; e < extras.length; e++) addScope(extras[e]);
    return scopes;
  }

  /**
   * Hide every theme variant picker pattern (Dawn pills, selects, Horizon, Craft…).
   * Scopes product-info / main product — variants are often outside the cart form.
   */
  function hideThemeVariantPickersInScope(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var blockSels = [
      "variant-selects",
      "variant-radios",
      "variant-picker",
      "product-variant-picker",
      "product-form-variant-picker",
      "[data-variant-picker]",
      "[data-product-options]",
      "[data-option-selector]",
      ".product-form__variants",
      ".product__variants",
      ".product-variants",
      ".variant-wrapper",
      ".variant-input-wrapper",
      ".product-form__option",
      ".product__option",
      ".swatch-attribute",
      ".product-block-variant-picker",
    ];
    for (var i = 0; i < blockSels.length; i++) {
      try {
        var blocks = scope.querySelectorAll(blockSels[i]);
        for (var j = 0; j < blocks.length; j++) {
          if (isOffrefyOwnedNode(blocks[j])) continue;
          markThemeHidden(blocks[j]);
        }
      } catch (eBlock) {
        void eBlock;
      }
    }

    var optionNodes = scope.querySelectorAll(
      'input[type="radio"][name^="options"],' +
        'input[type="radio"][name^="option"],' +
        'select[name^="options"],' +
        'select[name^="option"],' +
        'input[name^="options["]',
    );
    for (var oi = 0; oi < optionNodes.length; oi++) {
      var node = optionNodes[oi];
      if (isOffrefyOwnedNode(node)) continue;
      var wrap =
        (node.closest &&
          (node.closest("fieldset") ||
            node.closest("variant-radios") ||
            node.closest("variant-selects") ||
            node.closest("variant-picker") ||
            node.closest(".product-form__input") ||
            node.closest(".product-form__option") ||
            node.closest(".product__option") ||
            node.closest("[data-option-index]") ||
            node.closest(".variant-input-wrapper") ||
            node.closest(".variant-wrapper") ||
            node.closest(".swatch") ||
            node.closest("ul"))) ||
        node.parentElement;
      if (wrap && !isOffrefyOwnedNode(wrap)) markThemeHidden(wrap);
    }

    /* Label/legend-only rows some themes leave behind */
    try {
      var fieldsets = scope.querySelectorAll("fieldset.product-form__input, .product-form__input");
      for (var fi = 0; fi < fieldsets.length; fi++) {
        var fs = fieldsets[fi];
        if (isOffrefyOwnedNode(fs)) continue;
        if (
          fs.querySelector(
            'input[name^="options"], select[name^="options"], input[name^="option"], select[name^="option"]',
          )
        ) {
          markThemeHidden(fs);
        }
      }
    } catch (eFs) {
      void eFs;
    }
  }

  /**
   * Hide theme quantity steppers + “Quantity” label / full section (Dawn, Horizon…).
   * Often outside /cart/add form — scan product-info scopes.
   */
  function hideThemeQuantityInScope(scope) {
    if (!scope || !scope.querySelectorAll) return;

    function inCartChrome(el) {
      return !!(
        el &&
        el.closest &&
        (el.closest("cart-drawer") ||
          el.closest("cart-items") ||
          el.closest("[id*='CartDrawer']") ||
          el.closest(".cart__items") ||
          el.closest("cart-notification"))
      );
    }

    function hideQtySectionFrom(el) {
      if (!el || isOffrefyOwnedNode(el) || inCartChrome(el)) return;
      var section = null;
      try {
        section =
          (el.closest &&
            (el.closest(".product-form__quantity") ||
              el.closest("[data-quantity-wrapper]") ||
              el.closest(".ProductForm__QuantitySelector") ||
              el.closest(".product-form__input.product-form__quantity"))) ||
          null;
      } catch (eSec) {
        void eSec;
      }
      if (!section && el.closest) {
        try {
          section =
            el.closest(".product-form__input:has(quantity-input)") ||
            el.closest(".product-form__input:has(.quantity)") ||
            el.closest(".product-form__input:has(input[name='quantity'])") ||
            null;
        } catch (eHas) {
          void eHas;
        }
      }
      if (section && !isOffrefyOwnedNode(section)) {
        markThemeHidden(section);
        return;
      }
      /* Label + stepper as siblings — hide label and nearest qty control parent */
      markThemeHidden(el);
      if (el.tagName === "LABEL" || (el.classList && el.classList.contains("quantity__label"))) {
        var sib =
          el.nextElementSibling ||
          (el.parentElement && el.parentElement.querySelector(
            "quantity-input, quantity-selector, .quantity, .product-form__quantity",
          ));
        if (sib && !isOffrefyOwnedNode(sib) && !inCartChrome(sib)) {
          var sibWrap =
            (sib.closest &&
              (sib.closest(".product-form__quantity") ||
                sib.closest(".product-form__input") ||
                sib.closest(".quantity"))) ||
            sib;
          markThemeHidden(sibWrap);
        }
        if (el.parentElement && !isOffrefyOwnedNode(el.parentElement)) {
          var kids = el.parentElement.children;
          var onlyQty = true;
          for (var k = 0; k < kids.length; k++) {
            var c = kids[k];
            if (c === el) continue;
            if (
              c.matches &&
              (c.matches("quantity-input") ||
                c.matches("quantity-selector") ||
                c.matches(".quantity") ||
                c.matches(".price-per-item__container") ||
                (c.querySelector &&
                  c.querySelector(
                    "quantity-input, .quantity__button, input[name='quantity']",
                  )))
            ) {
              markThemeHidden(c);
              continue;
            }
            onlyQty = false;
          }
          if (onlyQty || el.parentElement.classList.contains("product-form__input")) {
            markThemeHidden(el.parentElement);
          }
        }
      }
    }

    var blockSels = [
      "quantity-input",
      "quantity-selector",
      "quantity-popover",
      ".product-form__quantity",
      "[data-quantity-input]",
      "[data-quantity-selector]",
      ".product-form__input.product-form__quantity",
      ".price-per-item__container",
    ];
    for (var i = 0; i < blockSels.length; i++) {
      try {
        var blocks = scope.querySelectorAll(blockSels[i]);
        for (var j = 0; j < blocks.length; j++) {
          if (isOffrefyOwnedNode(blocks[j]) || inCartChrome(blocks[j])) continue;
          hideQtySectionFrom(blocks[j]);
        }
      } catch (eQty) {
        void eQty;
      }
    }

    /* Explicit Quantity labels (left behind when only the stepper was hidden) */
    var labelSels = [
      "label.quantity__label",
      ".quantity__label",
      "label[for*='Quantity']",
      "label[for*='quantity']",
      ".product-form__quantity .form__label",
      ".product-form__quantity label",
    ];
    for (var li = 0; li < labelSels.length; li++) {
      try {
        var labs = scope.querySelectorAll(labelSels[li]);
        for (var lj = 0; lj < labs.length; lj++) {
          if (isOffrefyOwnedNode(labs[lj]) || inCartChrome(labs[lj])) continue;
          hideQtySectionFrom(labs[lj]);
        }
      } catch (eLab) {
        void eLab;
      }
    }

    /* Fallback: leftover “Quantity” label text after stepper was hidden */
    try {
      var formLabels = scope.querySelectorAll(
        "label, .form__label, .quantity__label, span.form__label, p.form__label, .ProductForm__Label, [class*='quantity'] label, [class*='Quantity'] label",
      );
      for (var fl = 0; fl < formLabels.length; fl++) {
        var lab = formLabels[fl];
        if (isOffrefyOwnedNode(lab) || inCartChrome(lab)) continue;
        var txt = String(lab.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        /* Keep short — avoid matching long product copy */
        if (!txt || txt.length > 40) continue;
        var looksQty =
          txt === "quantity" ||
          txt.indexOf("quantity") === 0 ||
          txt === "quantité" ||
          txt.indexOf("quantité") === 0 ||
          txt === "anzahl" ||
          txt === "menge" ||
          txt.indexOf("cantidad") === 0 ||
          txt.indexOf("quantità") === 0 ||
          txt.indexOf("hoeveelheid") === 0 ||
          txt === "qty" ||
          txt === "qty.";
        if (!looksQty) continue;
        hideQtySectionFrom(lab);
      }
    } catch (eFormLab) {
      void eFormLab;
    }

    /*
     * Orphan text nodes / bare elements: theme hid the stepper via our earlier pass
     * but left a lone “Quantity” line (common when label is a sibling, not inside
     * quantity-input).
     */
    try {
      var orphans = scope.querySelectorAll(
        "label, span, p, div, legend, dt, strong, small",
      );
      for (var oi = 0; oi < orphans.length; oi++) {
        var orphan = orphans[oi];
        if (isOffrefyOwnedNode(orphan) || inCartChrome(orphan)) continue;
        if (orphan.getAttribute && orphan.getAttribute("data-offrefy-theme-hidden") === "1") {
          continue;
        }
        /* Only leaf-ish nodes (no nested product blocks) */
        if (orphan.children && orphan.children.length > 2) continue;
        if (
          orphan.querySelector &&
          orphan.querySelector(
            "img, video, iframe, form, product-info, .product__title, h1, h2",
          )
        ) {
          continue;
        }
        var oTxt = String(orphan.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          oTxt !== "quantity" &&
          oTxt !== "quantité" &&
          oTxt !== "anzahl" &&
          oTxt !== "menge" &&
          oTxt !== "cantidad" &&
          oTxt !== "quantità" &&
          oTxt !== "hoeveelheid" &&
          oTxt !== "qty" &&
          oTxt !== "qty."
        ) {
          continue;
        }
        hideQtySectionFrom(orphan);
      }
    } catch (eOrphan) {
      void eOrphan;
    }

    var qtyInputs = scope.querySelectorAll(
      'input[name="quantity"]:not([type="hidden"]), input.quantity__input',
    );
    for (var qi = 0; qi < qtyInputs.length; qi++) {
      var inp = qtyInputs[qi];
      if (isOffrefyOwnedNode(inp) || inCartChrome(inp)) continue;
      if (inp.getAttribute && inp.getAttribute("data-offrefy-qty-inject") === "1") {
        continue;
      }
      if (inp.getAttribute && inp.getAttribute("data-offrefy-liquid-qty") != null) {
        continue;
      }
      hideQtySectionFrom(inp);
    }

    try {
      var steppers = scope.querySelectorAll(
        ".quantity:has(.quantity__button), .quantity:has(.quantity__input), quantity-input.quantity",
      );
      for (var si = 0; si < steppers.length; si++) {
        if (isOffrefyOwnedNode(steppers[si]) || inCartChrome(steppers[si])) continue;
        hideQtySectionFrom(steppers[si]);
      }
    } catch (eStep) {
      var steppers2 = scope.querySelectorAll("quantity-input, div.quantity, .quantity");
      for (var s2 = 0; s2 < steppers2.length; s2++) {
        if (isOffrefyOwnedNode(steppers2[s2]) || inCartChrome(steppers2[s2])) continue;
        if (
          steppers2[s2].querySelector &&
          (steppers2[s2].querySelector(".quantity__button") ||
            steppers2[s2].querySelector(".quantity__input") ||
            steppers2[s2].querySelector('input[name="quantity"]') ||
            steppers2[s2].tagName === "QUANTITY-INPUT")
        ) {
          hideQtySectionFrom(steppers2[s2]);
        }
      }
      void eStep;
    }
  }

  /**
   * Hide theme product price (+ SKU when adjacent) across OS 2.0 themes.
   * Scopes product info, walks siblings near the Offrefy widget, and matches
   * money/SKU text when themes omit Dawn’s `.price` classes.
   */
  function hideThemePriceInScope(scope) {
    if (!scope || !scope.querySelectorAll) return;

    function inCartChrome(el) {
      return !!(
        el &&
        el.closest &&
        (el.closest("cart-drawer") ||
          el.closest("cart-items") ||
          el.closest("[id*='CartDrawer']") ||
          el.closest(".cart__items") ||
          el.closest("cart-notification") ||
          el.closest(".cart-item") ||
          el.closest("mini-cart") ||
          el.closest("cart-drawer-items") ||
          el.closest(".predictive-search") ||
          el.closest("product-recommendations") ||
          el.closest(".product-recommendations") ||
          el.closest(".related-products") ||
          el.closest(".complementary-products") ||
          el.closest("[id*='product-recommendations']") ||
          el.closest(".card-wrapper") ||
          el.closest(".product-card") ||
          el.closest("li.grid__item"))
      );
    }

    function isMoneyText(raw) {
      var t = String(raw || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!t || t.length > 48) return false;
      /* $1.50 | €12,99 | 1,50 € | £9.99 | 1.50 USD | CAD $1.50 */
      return (
        /^[\$€£¥₹]\s?\d/.test(t) ||
        /^\d{1,6}([.,]\d{2})?\s?[\$€£¥₹]/.test(t) ||
        /^\d{1,6}[.,]\d{2}\s*(usd|eur|gbp|cad|aud|chf)?$/i.test(t) ||
        /^(usd|eur|gbp|cad|aud)\s*[\$€£]?\s*\d/i.test(t)
      );
    }

    function isSkuText(raw) {
      var t = String(raw || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!t || t.length > 64) return false;
      return /^(sku|ref|réf|reference|référence|artikel|art\.?\s*nr)\s*[:.#]?\s*\S+/i.test(
        t,
      );
    }

    function looksLikePriceOrSkuBlock(el) {
      if (!el || isOffrefyOwnedNode(el) || inCartChrome(el)) return false;
      if (el.matches) {
        if (
          el.matches(
            "[id^='price-'], .price, .product__price, .product-price, .product-single__price, .product-info__price, .price-wrapper, .price__container, .money, [data-product-price], [data-price], [itemprop='price'], [itemprop='offers'], .product__sku, .product-sku, .sku, [itemprop='sku'], .product-meta__sku, .product-block--price, .product-block-price, .product-form__price, sale-price, product-price",
          )
        ) {
          return true;
        }
      }
      var txt = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!txt || txt.length > 80) return false;
      if (isMoneyText(txt) || isSkuText(txt)) return true;
      /* price + sku only in one wrapper */
      if (txt.length <= 80) {
        var lines = txt.split(/(?=\bSKU\b|\bRef\b)/i);
        if (lines.length >= 1) {
          var moneyish = false;
          var skuish = false;
          for (var li = 0; li < lines.length; li++) {
            var part = lines[li].trim();
            if (isMoneyText(part)) moneyish = true;
            if (isSkuText(part)) skuish = true;
          }
          if (moneyish && (skuish || lines.length === 1)) return true;
        }
      }
      return false;
    }

    function hidePriceNode(el) {
      if (!el || isOffrefyOwnedNode(el) || inCartChrome(el)) return;
      var wrap =
        (el.closest &&
          (el.closest("[id^='price-']") ||
            el.closest("[itemprop='offers']") ||
            el.closest(".product__price") ||
            el.closest(".product-price") ||
            el.closest(".product-single__price") ||
            el.closest(".product-info__price") ||
            el.closest(".ProductMeta__PriceList") ||
            el.closest(".price-wrapper") ||
            el.closest(".product-block--price") ||
            el.closest(".product-block-price") ||
            el.closest(".price__container") ||
            el.closest(".price"))) ||
        el;
      if (wrap && !isOffrefyOwnedNode(wrap) && !inCartChrome(wrap)) {
        markThemeHidden(wrap);
        /* Hide adjacent SKU sibling under the same parent */
        var parent = wrap.parentElement;
        if (parent && parent.children) {
          for (var ci = 0; ci < parent.children.length; ci++) {
            var ch = parent.children[ci];
            if (ch === wrap || isOffrefyOwnedNode(ch) || inCartChrome(ch)) continue;
            if (looksLikePriceOrSkuBlock(ch)) markThemeHidden(ch);
          }
        }
      }
    }

    var priceSels = [
      "[id^='price-']",
      "[itemprop='offers']",
      "[itemprop='price']",
      ".product__price",
      ".product-price",
      ".product-single__price",
      ".product-info__price",
      ".product__info-container > .price",
      ".price--large",
      ".price--on-sale",
      ".price--sold-out",
      ".price__container",
      ".price-item--regular",
      ".price-item--sale",
      ".price-item",
      ".ProductMeta__Price",
      ".ProductMeta__PriceList",
      ".price-wrapper",
      "[data-product-price]",
      "[data-price]",
      "[data-product-price-wrapper]",
      "sale-price",
      "product-price",
      ".product-block-price",
      ".product-block--price",
      ".product-form__price",
      ".product__current-price",
      ".current-price",
      ".product-pricing",
      ".price .money",
      ".money",
      ".product__sku",
      ".product-sku",
      ".sku",
      "[itemprop='sku']",
      ".product-meta__sku",
      ".product-block--sku",
      ".product-block-sku",
      ".product__reference",
    ];
    for (var i = 0; i < priceSels.length; i++) {
      try {
        var nodes = scope.querySelectorAll(priceSels[i]);
        for (var j = 0; j < nodes.length; j++) {
          hidePriceNode(nodes[j]);
        }
      } catch (ePrice) {
        void ePrice;
      }
    }

    try {
      var prices = scope.querySelectorAll(".price");
      for (var pi = 0; pi < prices.length; pi++) {
        var pEl = prices[pi];
        if (isOffrefyOwnedNode(pEl) || inCartChrome(pEl)) continue;
        if (
          pEl.querySelector &&
          (pEl.querySelector(".price-item") ||
            pEl.querySelector(".price__container") ||
            pEl.querySelector(".price__regular") ||
            pEl.querySelector(".price__sale") ||
            pEl.querySelector(".money") ||
            isMoneyText(pEl.textContent))
        ) {
          hidePriceNode(pEl);
        }
      }
    } catch (eDawn) {
      void eDawn;
    }

    /* Leaf / near-leaf nodes whose entire text is a price or SKU line */
    try {
      var candidates = scope.querySelectorAll(
        "div, span, p, strong, b, em, small, h1, h2, h3, h4, h5, h6, dd, dt, li",
      );
      for (var oi = 0; oi < candidates.length; oi++) {
        var node = candidates[oi];
        if (isOffrefyOwnedNode(node) || inCartChrome(node)) continue;
        if (node.children && node.children.length > 4) continue;
        if (
          node.querySelector &&
          node.querySelector(
            "img, video, iframe, form, input, button, a[href], nav, ul, ol, table",
          )
        ) {
          continue;
        }
        var nTxt = String(node.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!nTxt || nTxt.length > 64) continue;
        if (isMoneyText(nTxt) || isSkuText(nTxt)) {
          hidePriceNode(node);
        }
      }
    } catch (eLeaf) {
      void eLeaf;
    }
  }

  /** Product + widget-neighbor scopes so price blocks outside the cart form still hide. */
  function themePriceHideScopes() {
    var scopes = themeProductScopes();
    function add(el) {
      if (!el || isOffrefyOwnedNode(el)) return;
      for (var i = 0; i < scopes.length; i++) {
        if (scopes[i] === el) return;
      }
      scopes.push(el);
    }
    var roots = document.querySelectorAll("[data-offrefy-root]");
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      add(
        root.closest("product-info") ||
          root.closest("[data-product-info]") ||
          root.closest(".product__info-container") ||
          root.closest(".product__info-wrapper") ||
          root.closest(".product-information") ||
          root.closest(".product-details") ||
          root.closest(".product-single") ||
          root.closest(".product") ||
          root.closest(".shopify-section") ||
          root.parentElement,
      );
      /* App block wrapper + following siblings (price/SKU often sit right under the widget) */
      var block =
        root.closest(".shopify-block") ||
        root.closest("[id^='shopify-block']") ||
        root.parentElement;
      if (block) {
        add(block.parentElement || block);
        var sib = block.nextElementSibling;
        var guard = 0;
        while (sib && guard < 8) {
          var st = String(sib.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          var onlyPriceSku =
            st.length > 0 &&
            st.length <= 120 &&
            !sib.querySelector(
              "form, [data-offrefy-root], .product__description, .product-description, rte, .rte",
            );
          if (
            onlyPriceSku &&
            (/[\$€£¥₹]|\d[.,]\d{2}|sku\s*:|ref\s*:/i.test(st) ||
              (sib.matches &&
                sib.matches(
                  ".price, .product__price, .product-price, .money, .sku, .product__sku, [id^='price-']",
                )))
          ) {
            if (!isOffrefyOwnedNode(sib)) markThemeHidden(sib);
            sib = sib.nextElementSibling;
            guard += 1;
            continue;
          }
          break;
        }
      }
    }
    add(document.querySelector("main"));
    add(document.getElementById("MainContent"));
    add(document.getElementById("main-content"));
    add(document.querySelector(".main-content"));
    return scopes;
  }

  /**
   * Apply Theme product form hide options on real theme markup (all OS 2.0 themes).
   * CSS data-attrs are a backup; direct display:none is the reliable path.
   * opts.clearWhenOff: only then remove html flags (avoid wiping Liquid early flags
   * during preview/default paint before real campaign config loads).
   */
  function applyThemeFormVisibility(ui, opts) {
    opts = opts || {};
    var clearWhenOff = opts.clearWhenOff === true;
    var hideAtc = !!(ui && ui.hideThemeAddToCart === true);
    var hideBin = !!(ui && ui.hideThemeBuyItNow === true);
    var hideVar = !!(ui && ui.hideThemeVariantSelector === true);
    var hideQty = !!(ui && ui.hideThemeQuantitySelector === true);
    var hidePrice = !!(ui && ui.hideThemePrice === true);

    try {
      var html = document.documentElement;
      if (hideAtc) html.setAttribute("data-offrefy-hide-theme-atc", "1");
      else if (clearWhenOff) html.removeAttribute("data-offrefy-hide-theme-atc");
      if (hideBin) html.setAttribute("data-offrefy-hide-theme-bin", "1");
      else if (clearWhenOff) html.removeAttribute("data-offrefy-hide-theme-bin");
      if (hideVar) html.setAttribute("data-offrefy-hide-theme-variant", "1");
      else if (clearWhenOff) html.removeAttribute("data-offrefy-hide-theme-variant");
      if (hideQty) html.setAttribute("data-offrefy-hide-theme-qty", "1");
      else if (clearWhenOff) html.removeAttribute("data-offrefy-hide-theme-qty");
      if (hidePrice) html.setAttribute("data-offrefy-hide-theme-price", "1");
      else if (clearWhenOff) html.removeAttribute("data-offrefy-hide-theme-price");

      /* Keep Liquid early flags active until a real campaign clears them. */
      if (html.getAttribute("data-offrefy-hide-theme-atc") === "1") hideAtc = true;
      if (html.getAttribute("data-offrefy-hide-theme-bin") === "1") hideBin = true;
      if (html.getAttribute("data-offrefy-hide-theme-variant") === "1") hideVar = true;
      if (html.getAttribute("data-offrefy-hide-theme-qty") === "1") hideQty = true;
      if (html.getAttribute("data-offrefy-hide-theme-price") === "1") hidePrice = true;
    } catch (eAttr) {
      void eAttr;
    }

    clearThemeHidden(document);

    if (!hideAtc && !hideBin && !hideVar && !hideQty && !hidePrice) return;

    var scopes = themeProductScopes();
    if (hideVar || hideQty) {
      for (var si = 0; si < scopes.length; si++) {
        if (hideVar) hideThemeVariantPickersInScope(scopes[si]);
        if (hideQty) hideThemeQuantityInScope(scopes[si]);
      }
    }
    if (hidePrice) {
      var priceScopes = themePriceHideScopes();
      for (var psi = 0; psi < priceScopes.length; psi++) {
        hideThemePriceInScope(priceScopes[psi]);
      }
    }

    var forms = themeCartAddForms();
    for (var fi = 0; fi < forms.length; fi++) {
      var form = forms[fi];
      if (hideAtc) {
        var atcBtns = collectThemeAtcButtons(form);
        for (var ai = 0; ai < atcBtns.length; ai++) markThemeHidden(atcBtns[ai]);
      }
      if (hideBin) {
        var binSels = [
          ".shopify-payment-button",
          "shopify-accelerated-checkout",
          "buy-buttons",
          "[data-shopify='payment-button']",
          ".shopify-payment-button__button",
        ];
        for (var bi = 0; bi < binSels.length; bi++) {
          var bins = form.querySelectorAll(binSels[bi]);
          for (var bj = 0; bj < bins.length; bj++) markThemeHidden(bins[bj]);
        }
        var host = form.closest("product-info") || form.parentElement;
        if (host && host.querySelectorAll) {
          var hostBins = host.querySelectorAll(
            ".shopify-payment-button, shopify-accelerated-checkout, buy-buttons",
          );
          for (var hk = 0; hk < hostBins.length; hk++) markThemeHidden(hostBins[hk]);
        }
      }
    }
  }

  /**
   * Ensure theme form posts the widget qty.
   * Valor (and similar) often omit name="quantity" — inject a hidden field then.
   *
   * Important: never treat our own inject as a "theme qty field" and then remove it
   * before submit — that left the form with no quantity (Shopify defaults to 1),
   * which broke the 2nd ATC after a successful inject (e.g. Cop 2 OK → Cop 3 = 1).
   */
  function ensureThemeFormQuantity(form, quantity) {
    var qty = parseInt(String(quantity), 10) || 1;
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var strQty = String(qty);
    var themeUpdated = 0;

    function isOffrefyQtyInject(el) {
      return !!(
        el &&
        el.getAttribute &&
        el.getAttribute("data-offrefy-qty-inject") === "1"
      );
    }

    function setQtyEl(el) {
      if (!el || isOffrefyQtyInject(el)) return;
      try {
        el.value = strQty;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        themeUpdated += 1;
      } catch (e) {
        void e;
      }
    }

    var qtyNodes = form.querySelectorAll(
      'input[name="quantity"], select[name="quantity"]',
    );
    for (var qi = 0; qi < qtyNodes.length; qi++) setQtyEl(qtyNodes[qi]);

    var formId = form.getAttribute("id");
    if (formId) {
      var linked = document.querySelectorAll(
        'input[name="quantity"][form="' +
          formId +
          '"], select[name="quantity"][form="' +
          formId +
          '"]',
      );
      for (var li = 0; li < linked.length; li++) setQtyEl(linked[li]);
    }

    /* Valor quantity-input custom element (data-quantity-field, often outside form). */
    var scope =
      form.closest(".valor-mp__buy") ||
      form.closest("product-info") ||
      form.closest("[id^='MainProduct']") ||
      form.closest(".shopify-section") ||
      form.parentElement;
    if (scope) {
      var customQty = scope.querySelectorAll(
        "quantity-input [data-quantity-field], [data-quantity-field]",
      );
      for (var ci = 0; ci < customQty.length; ci++) {
        if (customQty[ci].closest(".offrefy-root")) continue;
        setQtyEl(customQty[ci]);
      }
    }

    var injected = form.querySelector('input[data-offrefy-qty-inject="1"]');
    if (themeUpdated > 0) {
      /* Real theme qty exists — drop inject so FormData does not send quantity twice. */
      if (injected && injected.parentNode) {
        injected.parentNode.removeChild(injected);
      }
      return true;
    }

    if (!injected) {
      injected = document.createElement("input");
      injected.type = "hidden";
      injected.name = "quantity";
      injected.setAttribute("data-offrefy-qty-inject", "1");
      form.appendChild(injected);
    }
    injected.value = strQty;
    return true;
  }

  function syncThemeCartAddForm(form, variantId, quantity, attribution) {
    if (!form) return false;
    var vid = String(variantId || "");

    var idSelect = form.querySelector('select[name="id"]');
    if (idSelect) {
      idSelect.value = vid;
      try {
        idSelect.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e1) {
        void e1;
      }
    }
    var idInputs = form.querySelectorAll('input[name="id"]');
    for (var ii = 0; ii < idInputs.length; ii++) {
      idInputs[ii].value = vid;
      try {
        idInputs[ii].dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e2) {
        void e2;
      }
    }

    ensureThemeFormQuantity(form, quantity);
    applyOffrefyPropertiesToForm(form, attribution);
    return true;
  }

  /**
   * Widget ATC → theme native submit.
   * Target: form[action*="/cart/add"] [type="submit"]
   * If theme has no qty field, inject hidden quantity from the widget.
   */
  function addVariantToCartByThemeSubmit(variantId, quantity, attribution) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) {
      return Promise.reject(new Error("Invalid variant"));
    }
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));

    var form = findThemeProductCartForm();
    /* Example: form[action*="/cart/add"] [type="submit"] */
    var btn = findThemeCartAddSubmitButton(form);
    if (!form || !btn) {
      return Promise.reject(new Error("No theme add to cart button"));
    }

    syncThemeCartAddForm(form, id, qty, attribution);

    try {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(btn);
      } else if (typeof btn.click === "function") {
        btn.click();
      } else {
        return Promise.reject(new Error("Theme submit failed"));
      }
    } catch (err) {
      return Promise.reject(err);
    }
    return Promise.resolve();
  }

  function addVariantToCartByAjax(variantId, quantity, attribution) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) {
      return Promise.reject(new Error("Invalid variant"));
    }
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var payload = { id: id, quantity: qty };
    var props = offrefyCartProperties(attribution);
    if (props) payload.properties = props;
    return fetch(shopifyRoutesRoot() + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (data) {
          if (res.ok) return data || {};
          var msg =
            data && data.description
              ? String(data.description)
              : data && data.message
                ? String(data.message)
                : "Cart add failed";
          throw new Error(msg);
        });
    });
  }

  function checkoutPermalinkHref(variantId, quantity) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) return checkoutUrlHref();
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    return window.location.origin + "/cart/" + String(id) + ":" + String(qty);
  }

  function addVariantToCart(variantId, quantity, action, attribution) {
    var qty = parseInt(String(quantity), 10) || 1;
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    var act = String(action || "add_to_cart");
    if (act === "go_to_checkout") {
      return Promise.resolve({
        redirectHref: checkoutPermalinkHref(variantId, qty),
      });
    }
    if (act === "go_to_page") {
      return addVariantToCartByAjax(variantId, qty, attribution);
    }
    return addVariantToCartByThemeSubmit(variantId, qty, attribution);
  }


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

  function completeAfterCartAdd(ui, addResult) {
    var act = String(ui.ctaButtonAction || "add_to_cart");
    if (act === "go_to_checkout") {
      window.location.href =
        addResult && addResult.redirectHref
          ? String(addResult.redirectHref)
          : checkoutUrlHref();
      return Promise.resolve();
    }
    if (act === "go_to_page") {
      var href = resolveSafePageHref(ui.ctaButtonPageUrl);
      if (href) window.location.href = href;
      return Promise.resolve();
    }
    /* add_to_cart / open_drawer: theme ProductForm handles cart + drawer. */
    return Promise.resolve();
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
    if (pos === "top_left") return "offrefy-card__badge-top--align-start";
    if (pos === "top_center") return "offrefy-card__badge-top--align-center";
    return "offrefy-card__badge-top--align-end";
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
    root.setAttribute("data-offrefy-header-layout", layout);
    if (d.widgetHeaderMobileStack === true) {
      root.setAttribute("data-offrefy-header-mobile-stack", "1");
    } else {
      root.removeAttribute("data-offrefy-header-mobile-stack");
    }
    if (effectiveWidgetHeaderSwapOrder(d)) {
      root.setAttribute("data-offrefy-header-swap", "1");
    } else {
      root.removeAttribute("data-offrefy-header-swap");
    }
    var ha = pickWidgetHeaderTextAlign(d.widgetHeadingAlign, "center");
    var ca = pickWidgetHeaderTextAlign(d.countdownAlign, "center");
    // Heading "Right" → pin timer to the trailing edge (matches merchant intent).
    if (ha === "end") ca = "end";
    root.setAttribute("data-offrefy-heading-align", ha);
    root.setAttribute("data-offrefy-countdown-align", ca);
    root.style.setProperty("--offrefy-heading-text-align", ha);
    root.style.setProperty("--offrefy-countdown-justify", countdownAlignToJustify(ca));
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
    widgetHeading: "Get more, save more 🥳",
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
    ctaButtonAction: "add_to_cart",
    ctaButtonPageUrl: "",
    hideThemeAddToCart: false,
    hideThemeBuyItNow: false,
    hideThemeVariantSelector: false,
    hideThemeQuantitySelector: false,
    hideThemePrice: false,
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
    badgeDesign: "pill",
    badgeBackgroundColor: "#6b1d1e",
    badgeTextColor: "#ffffff",
    badgeSizeScalePercent: 100,
    appearanceTemplateId: "classic_burgundy",
    appearanceDecorThemeId: "classic_burgundy",
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
    var el = root.querySelector("script[data-offrefy-variants-json]");
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
      if (form.closest(".offrefy-root")) continue;
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
    if (root.getAttribute("data-offrefy-hydrating") === "1") {
      return Promise.resolve(false);
    }
    root.setAttribute("data-offrefy-hydrating", "1");
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

        var variantsScript = root.querySelector("script[data-offrefy-variants-json]");
        if (!variantsScript) {
          variantsScript = document.createElement("script");
          variantsScript.type = "application/json";
          variantsScript.setAttribute("data-offrefy-variants-json", "");
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
        root.removeAttribute("data-offrefy-hydrating");
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
    /* Normalize legacy Christmas template ids */
    var themeRaw = String(d.appearanceTemplateId || "").trim();
    var themeLegacy = {
      christmas_holly: "christmas_holly_bow",
      christmas_snow: "christmas_snowflake",
      christmas_gold: "christmas_santa_sleigh",
      christmas_candy: "christmas_candy_cane",
      christmas_evergreen: "christmas_gift_wrap",
      christmas_crimson: "christmas_santa_sleigh",
    };
    if (themeLegacy[themeRaw]) themeRaw = themeLegacy[themeRaw];
    d.appearanceTemplateId = themeRaw || "classic_burgundy";
    var decorRaw = String(d.appearanceDecorThemeId || "").trim();
    if (themeLegacy[decorRaw]) decorRaw = themeLegacy[decorRaw];
    if (!decorRaw && d.appearanceTemplateId && d.appearanceTemplateId !== "custom") {
      decorRaw = d.appearanceTemplateId;
    }
    d.appearanceDecorThemeId = decorRaw;
    return d;
  }

  function applyVolumeDiscountCustomCss(root, css) {
    var text = String(css != null ? css : "")
      .slice(0, VD_CUSTOM_CSS_MAX_CHARS)
      .trim();
    var el = root.querySelector("style[data-offrefy-custom-css]");
    if (!text) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-offrefy-custom-css", "");
      el.setAttribute("type", "text/css");
      root.insertBefore(el, root.firstChild);
    }
    el.textContent = text;
  }

  function applyWidgetDisplayToRoot(root, disp, _themeHeading) {
    var d = mergeWidgetDisplay(disp);
    root.removeAttribute("data-offrefy-font-scale");
    if (d.fontScale === "compact") root.setAttribute("data-offrefy-font-scale", "compact");
    else if (d.fontScale === "comfortable") root.setAttribute("data-offrefy-font-scale", "comfortable");

    /* Seasonal / appearance template decorations (Christmas candy cane, etc.) */
    root.removeAttribute("data-offrefy-theme");
    var themeId = String(d.appearanceTemplateId || "").trim();
    if (!themeId || themeId === "custom") {
      themeId = String(d.appearanceDecorThemeId || "").trim();
    }
    if (themeId && themeId !== "custom") {
      root.setAttribute("data-offrefy-theme", themeId);
    }

    applyWidgetHeaderDisplayToRoot(root, d);

    root.style.setProperty("--offrefy-maroon", String(d.primaryColor));
    root.style.setProperty("--offrefy-maroon-cta-hover", String(d.primaryHoverColor));
    root.style.setProperty("--offrefy-pink-bg", String(d.selectedBgColor));
    root.style.setProperty("--offrefy-countdown-bg", String(d.countdownBgColor));
    root.style.setProperty("--offrefy-countdown-text", String(d.countdownTextColor));
    root.style.setProperty("--offrefy-save", String(d.savingsColor));
    root.style.setProperty(
      "--offrefy-vt-discount-fg",
      String(d.volumeTableDiscountColor || d.savingsColor),
    );
    root.style.setProperty(
      "--offrefy-option-subtext",
      String(d.optionSubtextColor || d.savingsColor),
    );
    root.style.setProperty("--offrefy-muted", String(d.mutedColor));
    root.style.setProperty("--offrefy-card-border", String(d.cardBorderColor));
    root.style.setProperty(
      "--offrefy-radius-card",
      String(clampRadiusPx(d.cardBorderRadiusPx, 14)) + "px",
    );
    root.style.setProperty(
      "--offrefy-radius-cta",
      String(clampRadiusPx(d.buttonBorderRadiusPx, 14)) + "px",
    );
    root.style.setProperty(
      "--offrefy-radius-control",
      String(clampRadiusPx(d.controlBorderRadiusPx, WD_DEFAULT.controlBorderRadiusPx)) + "px",
    );
    root.style.setProperty("--offrefy-maroon-border", String(d.primaryColor));
    root.style.setProperty("--offrefy-badge-bg", String(d.badgeBackgroundColor));
    root.style.setProperty("--offrefy-badge-text", String(d.badgeTextColor));
    root.style.setProperty(
      "--offrefy-badge-size-scale",
      String(clampBadgeSizeScalePct(d.badgeSizeScalePercent) / 100),
    );
    root.style.setProperty(
      "--offrefy-radio",
      String(clampRadioPx(d.radioButtonSizePx, WD_DEFAULT.radioButtonSizePx)) + "px",
    );
    root.style.setProperty(
      "--offrefy-radio-border",
      String(d.radioButtonBorderColor != null ? d.radioButtonBorderColor : "#bdbdbd"),
    );
    root.style.setProperty(
      "--offrefy-radio-accent",
      String(
        d.radioButtonAccentColor != null && String(d.radioButtonAccentColor).trim() !== ""
          ? d.radioButtonAccentColor
          : d.primaryColor,
      ),
    );

    var sp = d.fontSizeScalePercent;
    root.style.setProperty("--offrefy-fs-title", fontSizeToCssScaled(d.fontSizeTitle, sp));
    root.style.setProperty("--offrefy-fs-buy", fontSizeToCssScaled(d.fontSizeBuyLabel, sp));
    root.style.setProperty("--offrefy-fs-badge", fontSizeToCssScaled(d.fontSizeBadge, sp));
    root.style.setProperty("--offrefy-fs-price", fontSizeToCssScaled(d.fontSizePrice, sp));
    root.style.setProperty("--offrefy-fs-compare", fontSizeToCssScaled(d.fontSizeComparePrice, sp));
    root.style.setProperty("--offrefy-fs-save", fontSizeToCssScaled(d.fontSizeSavings, sp));
    root.style.setProperty(
      "--offrefy-fs-option-subtext",
      fontSizeToCssScaled(d.fontSizeOptionSubtext, sp),
    );
    root.style.setProperty("--offrefy-fs-cta", fontSizeToCssScaled(d.fontSizeButton, sp));
    root.style.setProperty("--offrefy-fs-cd-label", fontSizeToCssScaled(d.fontSizeCountdownLabel, sp));
    root.style.setProperty("--offrefy-fs-cd-badge", fontSizeToCssScaled(d.fontSizeCountdownValue, sp));
    root.style.setProperty("--offrefy-fs-footnote", fontSizeToCssScaled(d.fontSizeFootnote, sp));
    root.style.setProperty("--offrefy-fw-strong", String(d.fontWeightStrong));
    root.style.setProperty("--offrefy-fw-accent", String(d.fontWeightAccent));
    root.style.setProperty("--offrefy-fw-body", String(d.fontWeightBody));
    root.style.setProperty("--offrefy-fw-normal", String(d.fontWeightNormal));
    root.style.setProperty(
      "--offrefy-vt-cell-pad-block",
      String(clampVtCellPadPx(d.volumeTableCellPaddingPx, WD_DEFAULT.volumeTableCellPaddingPx)) +
        "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col1-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTableQuantityColumnAlign, "start")),
    );
    root.style.setProperty(
      "--offrefy-vt-col2-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTableDiscountColumnAlign, "center")),
    );
    root.style.setProperty(
      "--offrefy-vt-col3-text-align",
      String(pickWidgetHeaderTextAlign(d.volumeTablePriceColumnAlign, "end")),
    );
    root.style.setProperty(
      "--offrefy-vt-col1-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTableQuantityColPaddingStartPx,
          WD_DEFAULT.volumeTableQuantityColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col1-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTableQuantityColPaddingEndPx,
          WD_DEFAULT.volumeTableQuantityColPaddingEndPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col2-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTableDiscountColPaddingStartPx,
          WD_DEFAULT.volumeTableDiscountColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col2-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTableDiscountColPaddingEndPx,
          WD_DEFAULT.volumeTableDiscountColPaddingEndPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col3-pad-inline-start",
      String(
        clampVtColInlinePadPx(
          d.volumeTablePriceColPaddingStartPx,
          WD_DEFAULT.volumeTablePriceColPaddingStartPx,
        ),
      ) + "px",
    );
    root.style.setProperty(
      "--offrefy-vt-col3-pad-inline-end",
      String(
        clampVtColInlinePadPx(
          d.volumeTablePriceColPaddingEndPx,
          WD_DEFAULT.volumeTablePriceColPaddingEndPx,
        ),
      ) + "px",
    );

    applyVolumeDiscountCustomCss(root, d.customCss);

    var h = String(d.widgetHeading || "").trim();
    var ctaAct = String(d.ctaButtonAction || "add_to_cart");
    if (
      ctaAct !== "add_to_cart" &&
      ctaAct !== "add_to_cart_open_drawer" &&
      ctaAct !== "go_to_checkout" &&
      ctaAct !== "go_to_page"
    ) {
      ctaAct = "add_to_cart";
    }
    var pres = String(d.widgetPresentation || "").trim();
    return {
      title: h,
      widgetPresentation: pres === "volume_table" ? "volume_table" : "tier_cards",
      showCountdown: d.showCountdown === true || d.showCountdown === 1 || d.showCountdown === "true",
      countdownLabel: String(d.countdownLabel || WD_DEFAULT.countdownLabel).trim() ||
        WD_DEFAULT.countdownLabel,
      countdownTimeUnit: pickCountdownTimeUnit(d.countdownTimeUnit),
      countdownTimeAmount: (function () {
        var amt = Math.floor(Number(d.countdownTimeAmount));
        if (!isFinite(amt) || amt < 1) return 1;
        return Math.min(9999, amt);
      })(),
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
      hideThemeAddToCart: d.hideThemeAddToCart === true || d.hideThemeAddToCart === 1 || d.hideThemeAddToCart === "true",
      hideThemeBuyItNow: d.hideThemeBuyItNow === true || d.hideThemeBuyItNow === 1 || d.hideThemeBuyItNow === "true",
      hideThemeVariantSelector: d.hideThemeVariantSelector === true || d.hideThemeVariantSelector === 1 || d.hideThemeVariantSelector === "true",
      hideThemeQuantitySelector: d.hideThemeQuantitySelector === true || d.hideThemeQuantitySelector === 1 || d.hideThemeQuantitySelector === "true",
      hideThemePrice: d.hideThemePrice === true || d.hideThemePrice === 1 || d.hideThemePrice === "true",
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
      badgeDesign: (function () {
        var bd = String(d.badgeDesign || "pill");
        var allowed = {
          pill: 1,
          rounded: 1,
          square: 1,
          soft: 1,
          outline: 1,
          outline_bold: 1,
          ghost: 1,
          ribbon: 1,
          flag: 1,
          tag: 1,
          capsule: 1,
          chip: 1,
          underline: 1,
          shadow: 1,
          gradient: 1,
          glow: 1,
          stamp: 1,
          ticket: 1,
          arrow: 1,
          banner: 1,
        };
        return allowed[bd] ? bd : "pill";
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
    // Offer "Widget heading" wins when set (keeps emoji / custom copy).
    // Settings translations only fill in when the offer heading is empty.
    var offerHeading = String(widgetDisplay.widgetHeading || "").trim();
    if (
      !offerHeading &&
      langTrans.transHeading != null &&
      String(langTrans.transHeading).trim() !== ""
    ) {
      widgetDisplay.widgetHeading = langTrans.transHeading;
    }
    // Offer "Text button" wins when set — same as heading (preview ↔ storefront).
    var offerCta = String(widgetDisplay.ctaLabel || "").trim();
    if (
      !offerCta &&
      langTrans.transCta != null &&
      String(langTrans.transCta).trim() !== ""
    ) {
      widgetDisplay.ctaLabel = langTrans.transCta;
    }
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

    /* Theme product form hide options — apply for all Online Store 2.0 themes. */
    applyThemeFormVisibility(ui, { clearWhenOff: true });

    var tiers = campaign.tiers.slice().sort(function (a, b) {
      return (a.minQty | 0) - (b.minQty | 0);
    });
    var localeKey = String(locale || "en")
      .toLowerCase()
      .split("-")[0];
    var tierCopyMap =
      campaign.tierCopy && typeof campaign.tierCopy === "object"
        ? campaign.tierCopy
        : null;
    var localeTierCopy =
      (tierCopyMap &&
        (tierCopyMap[locale] ||
          tierCopyMap[localeKey] ||
          null)) ||
      null;
    if (localeTierCopy && localeTierCopy.length) {
      for (var tci = 0; tci < tiers.length; tci++) {
        var copyRow = localeTierCopy[tci];
        if (!copyRow || typeof copyRow !== "object") continue;
        var copyBuy = String(copyRow.buyLabelText || "").trim();
        var copySub = String(copyRow.optionSubtext || "").trim();
        var copyBadge = String(copyRow.badge || "").trim();
        if (copyBuy) tiers[tci].buyLabel = copyBuy;
        if (copySub) tiers[tci].optionSubtext = copySub;
        if (copyBadge) tiers[tci].badge = copyBadge;
      }
    }
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
    var rn = "offrefy-tier-" + String(radioName).replace(/[^a-zA-Z0-9_-]/g, "-");

    function resolveActiveVariantIdForCart() {
      if (vdShowVariant) {
        var selAdd = mountEl.querySelector(
          ".offrefy-card--selected [data-offrefy-vd-vsel-input]",
        );
        if (!selAdd) {
          selAdd = mountEl.querySelector("[data-offrefy-vd-vsel-input]");
        }
        if (selAdd) return String(selAdd.value || "");
      }
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
      var label = "";
      for (var vi = 0; vi < variants.length; vi++) {
        var v = variants[vi];
        var id = String(v.id);
        var pr = parseInt(String(v.price), 10) || 0;
        var title = String(v.title || "Variant");
        var isSel = id === String(selId);
        if (isSel) label = title;
        var dis = v.available === false;
        o.push(
          '<button type="button" class="offrefy-vd-vsel__opt' +
            (isSel ? " is-selected" : "") +
            (dis ? " is-disabled" : "") +
            '" role="option" data-offrefy-vd-vid="' +
            id +
            '" data-offrefy-vd-price="' +
            pr +
            '" aria-selected="' +
            (isSel ? "true" : "false") +
            '"' +
            (dis ? " disabled aria-disabled=\"true\"" : "") +
            ">" +
            esc(title) +
            "</button>",
        );
      }
      if (!label && variants[0]) label = String(variants[0].title || "Variant");
      return {
        options: o.join(""),
        label: label,
        value: String(selId || (variants[0] && variants[0].id) || ""),
      };
    }

    function expandHtml(c, selId) {
      var picker = vdShowVariant ? variantOptionsHtml(selId) : null;
      var selectBlock = picker
        ? '<div class="offrefy-vd-vsel" data-offrefy-vd-vsel>' +
          '<button type="button" class="offrefy-vd-vsel__trigger" data-offrefy-vd-vsel-trigger aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="offrefy-vd-vsel__label" data-offrefy-vd-vsel-label>' +
          esc(picker.label) +
          "</span>" +
          '<span class="offrefy-vd-vsel__chev" aria-hidden="true"></span>' +
          "</button>" +
          '<div class="offrefy-vd-vsel__panel" data-offrefy-vd-vsel-panel role="listbox" hidden>' +
          picker.options +
          "</div>" +
          '<input type="hidden" class="offrefy-vd-vsel__input" data-offrefy-vd-vsel-input value="' +
          esc(picker.value) +
          '" />' +
          "</div>"
        : "";
      var qtyBlock = ui.hideWidgetQuantitySelector
        ? ""
        : '<div class="offrefy-qty-group" role="group" aria-label="Quantity">' +
          '<button type="button" class="offrefy-qty-btn" data-offrefy-qty-dec aria-label="Decrease quantity"><span aria-hidden="true">−</span></button>' +
          '<input type="text" class="offrefy-qty-value" data-offrefy-qty-display inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="' +
          String(String(VD_MAX_LINE_QTY).length) +
          '" aria-label="Quantity" value="' +
          stateQty +
          '" />' +
          '<button type="button" class="offrefy-qty-btn" data-offrefy-qty-inc aria-label="Increase quantity"><span aria-hidden="true">+</span></button>' +
          "</div>";
      var qtyStack =
        qtyBlock === ""
          ? ""
          : '<div class="offrefy-qty-stack">' +
            qtyBlock +
            '<p class="offrefy-cart-qty-alert" data-offrefy-cart-qty-alert hidden tabindex="-1"></p>' +
            "</div>";
      var lineTotalBlock = ui.hideWidgetLineTotal
        ? ""
        : '<span class="offrefy-line-total" data-offrefy-line-total></span>';
      var tierAddBtn = ui.hideWidgetTierAddButton
        ? ""
        : '<button type="button" class="offrefy-add-outline" data-offrefy-tier-add>+ ' +
          esc(ui.transAdd || "Add") +
          "</button>";
      var trailingInner = qtyStack + tierAddBtn;
      var trailingHtml = trailingInner
        ? '<div class="offrefy-expand-trailing">' + trailingInner + "</div>"
        : "";
      if (!selectBlock && !lineTotalBlock && !trailingHtml) {
        return "";
      }
      var expandClasses = "offrefy-expand-compact";
      if (!vdShowVariant) expandClasses += " offrefy-expand-compact--no-variant";
      if (ui.hideWidgetQuantitySelector) expandClasses += " offrefy-expand-compact--no-qty";
      if (ui.hideWidgetLineTotal) expandClasses += " offrefy-expand-compact--no-line-total";
      /* Keep # · amount · qty · Add on one row; variant select sits above when shown. */
      var rowHtml =
        '<div class="offrefy-expand-row">' +
        '<span class="offrefy-tier-idx">#' +
        (c + 1) +
        "</span>" +
        lineTotalBlock +
        trailingHtml +
        "</div>";
      return (
        '<div class="offrefy-card__expand">' +
        '<div class="offrefy-card__divider" aria-hidden="true"></div>' +
        '<div class="' +
        expandClasses +
        '">' +
        selectBlock +
        rowHtml +
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

    function updateAllPrices() {
      var uc = currentUnitCents;
      if (isVolumeTable) {
        var trows = mountEl.querySelectorAll(".offrefy-volume-tier-row");
        for (var vi = 0; vi < tiers.length; vi++) {
          var vt = tiers[vi];
          var vu = tierUnitCents(uc, vt);
          var vrow = trows[vi];
          if (!vrow) continue;
          var vmain = vrow.querySelector("[data-offrefy-main-price]");
          if (vmain) vmain.textContent = fmtMoney(vu, currency);
          var vdisc = vrow.querySelector("[data-offrefy-discount-cell]");
          if (vdisc) vdisc.textContent = tierVolumeTableDiscountLabel(vt);
        }
        return;
      }
      var perUnitCards = ui.cardPriceShowsUnit === true;
      var cards = mountEl.querySelectorAll(".offrefy-card");
      for (var i = 0; i < tiers.length; i++) {
        var d = tiers[i];
        var lt = lineTotals(uc, d);
        var P = Math.max(0, lt.original - lt.discounted);
        var minQ = lt.minQty;
        var u = tierUnitCents(uc, d);
        var card = cards[i];
        if (!card) continue;
        var strike = card.querySelector("[data-offrefy-tier-was]");
        var save = card.querySelector("[data-offrefy-tier-save]");
        var mainP = card.querySelector("[data-offrefy-main-price]");
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
      var cards = mountEl.querySelectorAll(".offrefy-card");
      for (var i = 0; i < tiers.length; i++) {
        var card = cards[i];
        if (!card) continue;
        var el = card.querySelector("[data-offrefy-line-total]");
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
      var nodes = mountEl.querySelectorAll("[data-offrefy-qty-display]");
      for (var qi = 0; qi < nodes.length; qi++) {
        var n = nodes[qi];
        if (n.tagName === "INPUT") {
          n.setAttribute("maxlength", String(String(VD_MAX_LINE_QTY).length));
          n.setAttribute("inputmode", "numeric");
          /* Always sync value — skipping focused inputs left stale "1" after tier switches. */
          n.value = str;
        } else {
          n.textContent = str;
        }
      }
      var decs = mountEl.querySelectorAll("[data-offrefy-qty-dec]");
      for (var dj = 0; dj < decs.length; dj++) {
        decs[dj].disabled = stateQty <= m;
      }
      updateAllLineTotals();
      syncQtyToForm();
    }

    function syncQtyToForm(forceTheme) {
      var qty = parseInt(String(stateQty), 10) || 1;
      qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
      var str = String(qty);
      var liquid = findVdLiquidProductForm(root);
      if (liquid) {
        var lq =
          liquid.querySelector("[data-offrefy-liquid-qty]") ||
          liquid.querySelector('input[name="quantity"]');
        if (lq) lq.value = str;
      }
      /* Isolation: never overwrite theme qty steppers. */
      void forceTheme;
    }

    function syncFormVariant(vid) {
      /* Isolation: sync only the in-block liquid form, not the theme product form. */
      var liquid = findVdLiquidProductForm(root);
      if (!liquid) return;
      var idInput =
        liquid.querySelector("[data-offrefy-liquid-variant-id]") ||
        liquid.querySelector('input[name="id"]') ||
        liquid.querySelector('select[name="id"]');
      if (idInput) idInput.value = String(vid);
    }

    function syncAllVariantSelects(vid) {
      if (!vdShowVariant) return;
      var id = String(vid);
      var title = "";
      for (var ti = 0; ti < variants.length; ti++) {
        if (String(variants[ti].id) === id) {
          title = String(variants[ti].title || "Variant");
          break;
        }
      }
      var pickers = mountEl.querySelectorAll("[data-offrefy-vd-vsel]");
      for (var si = 0; si < pickers.length; si++) {
        var box = pickers[si];
        var inp = box.querySelector("[data-offrefy-vd-vsel-input]");
        var lab = box.querySelector("[data-offrefy-vd-vsel-label]");
        if (inp) inp.value = id;
        if (lab && title) lab.textContent = title;
        var opts = box.querySelectorAll("[data-offrefy-vd-vid]");
        for (var oi = 0; oi < opts.length; oi++) {
          var isSel = String(opts[oi].getAttribute("data-offrefy-vd-vid")) === id;
          opts[oi].classList.toggle("is-selected", isSel);
          opts[oi].setAttribute("aria-selected", isSel ? "true" : "false");
        }
      }
    }

    function unportalVdVariantPanel(panel) {
      if (!panel || !panel.classList.contains("is-portaled")) return;
      var home = panel._offrefyPortalHome;
      panel.classList.remove("is-portaled", "is-dropup");
      panel.style.removeProperty("top");
      panel.style.removeProperty("left");
      panel.style.removeProperty("right");
      panel.style.removeProperty("width");
      panel.style.removeProperty("bottom");
      panel.style.removeProperty("max-height");
      panel.style.removeProperty("--offrefy-maroon");
      panel.style.removeProperty("--offrefy-card-border");
      panel.style.removeProperty("--offrefy-text");
      panel.style.removeProperty("--offrefy-surface-muted");
      panel.style.removeProperty("--offrefy-selected-bg");
      panel.style.removeProperty("--offrefy-radius-control");
      panel.style.removeProperty("--offrefy-fs-buy");
      panel.style.removeProperty("--offrefy-fw-body");
      panel.style.removeProperty("--offrefy-fw-strong");
      panel._offrefyOnPick = null;
      panel._offrefyClose = null;
      panel._offrefyOwnerBox = null;
      panel._offrefyOwnerMount = null;
      panel._offrefyPortalHome = null;
      if (home && home.parent) {
        if (home.nextSibling && home.nextSibling.parentNode === home.parent) {
          home.parent.insertBefore(panel, home.nextSibling);
        } else {
          home.parent.appendChild(panel);
        }
      }
    }

    function copyOffrefyVarsToPanel(panel) {
      if (!panel || !root) return;
      var cs = window.getComputedStyle(root);
      var keys = [
        "--offrefy-maroon",
        "--offrefy-card-border",
        "--offrefy-text",
        "--offrefy-surface-muted",
        "--offrefy-selected-bg",
        "--offrefy-radius-control",
        "--offrefy-fs-buy",
        "--offrefy-fw-body",
        "--offrefy-fw-strong",
      ];
      for (var i = 0; i < keys.length; i++) {
        var v = cs.getPropertyValue(keys[i]);
        if (v && String(v).trim()) panel.style.setProperty(keys[i], String(v).trim());
      }
    }

    function positionPortaledVdPanel(panel, trigger) {
      if (!panel || !trigger) return;
      var rect = trigger.getBoundingClientRect();
      var gap = 6;
      var edge = 8;
      var maxH = Math.min(260, Math.round(window.innerHeight * 0.45));
      var spaceBelow = window.innerHeight - rect.bottom - gap - edge;
      var spaceAbove = rect.top - gap - edge;
      var dropUp =
        spaceBelow < Math.min(160, maxH) && spaceAbove > spaceBelow;
      var avail = dropUp ? spaceAbove : spaceBelow;
      var height = Math.min(maxH, Math.max(96, avail));
      var left = Math.max(edge, Math.round(rect.left));
      var width = Math.round(rect.width);
      panel.style.setProperty("left", left + "px", "important");
      panel.style.setProperty("right", "auto", "important");
      panel.style.setProperty("width", width + "px", "important");
      panel.style.setProperty("max-height", Math.round(height) + "px", "important");
      if (dropUp) {
        panel.classList.add("is-dropup");
        panel.style.setProperty("top", "auto", "important");
        panel.style.setProperty(
          "bottom",
          Math.round(window.innerHeight - rect.top + gap) + "px",
          "important",
        );
      } else {
        panel.classList.remove("is-dropup");
        panel.style.setProperty("bottom", "auto", "important");
        panel.style.setProperty(
          "top",
          Math.round(rect.bottom + gap) + "px",
          "important",
        );
      }
    }

    function portalVdVariantPanel(box, panel, trigger) {
      if (!box || !panel || !trigger) return;
      if (!panel.classList.contains("is-portaled")) {
        panel._offrefyPortalHome = {
          parent: panel.parentNode,
          nextSibling: panel.nextSibling,
        };
        document.body.appendChild(panel);
        panel.classList.add("is-portaled");
      }
      panel._offrefyOwnerBox = box;
      panel._offrefyOwnerMount = mountEl;
      copyOffrefyVarsToPanel(panel);
      panel._offrefyOnPick = function (vid, node) {
        applyVdVariantChoice(vid, node);
      };
      panel._offrefyClose = function () {
        closeAllVdVariantPickers();
      };
      positionPortaledVdPanel(panel, trigger);
    }

    function closeAllVdVariantPickers() {
      var pickers = mountEl.querySelectorAll("[data-offrefy-vd-vsel]");
      for (var i = 0; i < pickers.length; i++) {
        var panel = pickers[i].querySelector("[data-offrefy-vd-vsel-panel]");
        /* Panel may already be portaled on body — also find by owner link. */
        if (!panel) {
          var portaled = document.querySelectorAll(
            ".offrefy-vd-vsel__panel.is-portaled",
          );
          for (var pi = 0; pi < portaled.length; pi++) {
            if (portaled[pi]._offrefyOwnerBox === pickers[i]) {
              panel = portaled[pi];
              break;
            }
          }
        }
        var trig = pickers[i].querySelector("[data-offrefy-vd-vsel-trigger]");
        if (panel) {
          panel.setAttribute("hidden", "");
          unportalVdVariantPanel(panel);
        }
        if (trig) trig.setAttribute("aria-expanded", "false");
        pickers[i].classList.remove("is-open");
      }
      /* Safety: any orphaned portaled panels for this mount. */
      var orphans = document.querySelectorAll(".offrefy-vd-vsel__panel.is-portaled");
      for (var oi = 0; oi < orphans.length; oi++) {
        if (orphans[oi]._offrefyOwnerMount === mountEl) {
          orphans[oi].setAttribute("hidden", "");
          unportalVdVariantPanel(orphans[oi]);
        }
      }
      var cardsWrap = mountEl.querySelector(".offrefy-cards");
      if (cardsWrap) cardsWrap.classList.remove("offrefy-cards--vsel-open");
      if (root) root.classList.remove("offrefy-theme--vsel-open");
    }

    function setupVdPortalListeners() {
      if (offrefyNs()._offrefyVdPortalScrollClose) return;
      offrefyNs()._offrefyVdPortalScrollClose = true;
      /* Page scroll/resize: close menu so it never floats away from the trigger.
         Keep open when the user scrolls inside the portaled options list. */
      var onScrollOrResize = function (ev) {
        var t = ev && ev.target;
        if (
          t &&
          t.nodeType === 1 &&
          t.closest &&
          t.closest(".offrefy-vd-vsel__panel.is-portaled")
        ) {
          return;
        }
        var panels = document.querySelectorAll(
          ".offrefy-vd-vsel__panel.is-portaled",
        );
        for (var i = 0; i < panels.length; i++) {
          var closeFn = panels[i]._offrefyClose;
          if (typeof closeFn === "function") closeFn();
        }
      };
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
    }

    function scrollToAtc() {
      clampQty();
      syncQtyToForm(false);
      var sel = mountEl.querySelector(
        ".offrefy-card--selected [data-offrefy-vd-vsel-input]",
      );
      if (sel) {
        syncFormVariant(sel.value);
        root.setAttribute("data-variant-id", String(sel.value));
      } else {
        var fb = root.getAttribute("data-variant-id");
        if (fb) syncFormVariant(fb);
      }
      var focusEl =
        mountEl.querySelector("[data-offrefy-cta]") ||
        mountEl.querySelector("[data-offrefy-tier-add]") ||
        root;
      try {
        focusEl.scrollIntoView({ behavior: "smooth", block: "center" });
        if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
      } catch (eScroll) {
        void eScroll;
      }
    }

    function syncSelectedCard() {
      var labels = mountEl.querySelectorAll(".offrefy-card");
      for (var i = 0; i < labels.length; i++) {
        var lab = labels[i];
        var inp = lab.querySelector("input[type=radio]");
        var isSelected = !!(inp && inp.checked);
        lab.classList.toggle("offrefy-card--selected", isSelected);
        lab.setAttribute("aria-checked", isSelected ? "true" : "false");
        var expand = lab.querySelector(".offrefy-card__expand");
        if (expand) {
          if (isSelected) {
            expand.removeAttribute("hidden");
          } else {
            expand.setAttribute("hidden", "");
          }
        }
      }
    }

    /** Always select the clicked tier card (label nesting was flaky on tier 2/3). */
    function selectCard(card, snapQty) {
      if (!card || !mountEl.contains(card)) return false;
      var radio = card.querySelector('input[name="' + rn + '"]');
      if (!radio) return false;
      var changed = !radio.checked;
      if (changed) {
        var radios = mountEl.querySelectorAll('input[name="' + rn + '"]');
        for (var ri = 0; ri < radios.length; ri++) {
          radios[ri].checked = false;
        }
        radio.checked = true;
      }
      syncSelectedCard();
      /*
       * Only snap qty when the selected *tier* changes.
       * Re-clicking the already-selected card (or blur after typing) must keep
       * the manually entered quantity — previously snapQty=true reset to tier min.
       */
      if (changed) {
        try {
          if (
            document.activeElement &&
            document.activeElement.getAttribute &&
            document.activeElement.getAttribute("data-offrefy-qty-display") != null
          ) {
            document.activeElement.blur();
          }
        } catch (eBlur) {
          void eBlur;
        }
        stateQty = getTierMinQty();
        updateQtyDisplay();
      } else {
        var minNow = getTierMinQty();
        if (stateQty < minNow) {
          stateQty = minNow;
          updateQtyDisplay();
        }
      }
      return changed;
    }

    function ensureCardSelectedFromNode(node) {
      if (!node || !node.closest) return false;
      return selectCard(node.closest(".offrefy-card"), true);
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
        "[data-offrefy-cart-qty-alert], [data-offrefy-cart-qty-alert-global]",
      );
      for (var ci = 0; ci < nodes.length; ci++) {
        nodes[ci].setAttribute("hidden", "");
        nodes[ci].textContent = "";
      }
    }

    function getVdActiveCartQtyAlertEl() {
      var per = mountEl.querySelector(".offrefy-card--selected [data-offrefy-cart-qty-alert]");
      if (per) return per;
      return mountEl.querySelector("[data-offrefy-cart-qty-alert-global]");
    }

    function showVdCartMaxQtyMessageAndGoToCart() {
      clearVdCartQtyAlert();
      var alertEl = getVdActiveCartQtyAlertEl();
      var msg =
        (offrefyNs().messages && offrefyNs().messages.cartMaxQty) ||
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
      var el = mountEl.querySelector("[data-offrefy-stock-alert]");
      if (!el) return;
      el.textContent =
        (offrefyNs().messages && offrefyNs().messages.soldOut) ||
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
      var ctaEl = mountEl.querySelector("[data-offrefy-cta]");
      if (ctaEl) ctaEl.disabled = !purchasable;
      var tierAdds = mountEl.querySelectorAll("[data-offrefy-tier-add]");
      for (var tax = 0; tax < tierAdds.length; tax++) {
        tierAdds[tax].disabled = !purchasable;
      }
      var ael = mountEl.querySelector("[data-offrefy-stock-alert]");
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
    // showCountdown without a saved Schedule end: fall back to amount × unit from now
    // so the pill still renders (admin preview used to show a demo timer in this case).
    if (ui.showCountdown === true && isNaN(cdEndsMs)) {
      var cdAmt = Math.max(1, Math.floor(Number(ui.countdownTimeAmount)) || 1);
      var cdMult =
        ui.countdownTimeUnit === "hours"
          ? 3600
          : ui.countdownTimeUnit === "minutes"
            ? 60
            : 86400;
      cdEndsMs = Date.now() + cdAmt * cdMult * 1000;
    }
    var cdLive = ui.showCountdown === true && !isNaN(cdEndsMs);

    var h = [];
    h.push(
      '<div class="offrefy-bundle' +
        (isVolumeTable ? " offrefy-bundle--volume-table" : "") +
        '">',
    );
    var sec = String(sectionHeading || "").trim();
    if (sec) {
      h.push('<h2 class="offrefy-section-title">' + esc(sec) + "</h2>");
    }
    var titleText = String(ui.title || "").trim();
    if (titleText || cdLive) {
      h.push('<div class="offrefy-topbar">');
      if (titleText) {
        h.push('<p class="offrefy-title">' + esc(titleText) + "</p>");
      }
      if (cdLive) {
        var noticeRaw = String(ui.countdownLabel || "").trim();
        var notice =
          noticeRaw
            .replace(/\s*%c\s*/gi, " ")
            .replace(/\s+/g, " ")
            .trim() || "Sale end in";
        h.push('<div class="offrefy-countdown">');
        h.push('<span class="offrefy-countdown-muted">' + esc(notice) + "</span> ");
        h.push('<span class="offrefy-countdown-badge" data-offrefy-cd></span>');
        h.push("</div>");
      }
      h.push("</div>");
    }

    var selVariantId = vidRoot || firstAvailableVariantIdInList(variants) || "";

    if (isVolumeTable) {
      h.push(
        '<div class="offrefy-cards offrefy-cards--volume-table" role="radiogroup" aria-label="' +
          esc(String(ui.title || "").trim() || "Quantity breaks") +
          '">',
      );
      h.push('<div class="offrefy-volume-table-scroll">');
      h.push('<div class="offrefy-volume-table-scroll-inner">');
      h.push('<table class="offrefy-volume-table"><thead><tr>');
      h.push("<th>" + esc(ui.transQty) + "</th>");
      h.push("<th>" + esc(ui.transDiscount) + "</th>");
      h.push("<th>" + esc(ui.transPrice) + "</th>");
      h.push("</tr></thead><tbody>");
      for (var c = 0; c < tiers.length; c++) {
        var d = tiers[c];
        var uInit = tierUnitCents(currentUnitCents, d);
        h.push('<tr class="offrefy-volume-tier-row">');
        h.push("<td>" + esc(localizedTierBuyLabel(d.buyLabel, c, tiers, ui.transBuy)) + "</td>");
        h.push(
          '<td data-offrefy-discount-cell>' +
            esc(tierVolumeTableDiscountLabel(d)) +
            "</td>",
        );
        h.push(
          '<td><span class="offrefy-tier-amt" data-offrefy-main-price>' +
            fmtMoney(uInit, currency) +
            "</span></td>",
        );
        h.push("</tr>");
      }
      h.push("</tbody></table></div></div></div>");
    } else {
      h.push('<div class="offrefy-cards" role="radiogroup" aria-label="' + esc(String(ui.title || "").trim() || "Quantity breaks") + '">');
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
        var design = String(ui.badgeDesign || "pill");
        return (
          '<span class="offrefy-badge-pill offrefy-badge-pill--d-' +
          design +
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
          '<div class="offrefy-card' +
            (c2 === defaultIdx ? " offrefy-card--selected" : "") +
            (badge && isBadgeTopFloat(badgePos) ? " offrefy-card--badge-top-float" : "") +
            '" tabindex="0" aria-checked="' +
            (c2 === defaultIdx ? "true" : "false") +
            '" data-tier-index="' +
            c2 +
            '">',
        );
        h.push(
          '<input class="offrefy-sr-only" type="radio" name="' +
            rn +
            '" value="' +
            d.minQty +
            '" tabindex="-1"' +
            (c2 === defaultIdx ? " checked" : "") +
            "/>",
        );
        if (badge && isBadgeTopFloat(badgePos)) {
          h.push(
            '<div class="offrefy-card__badge-top offrefy-card__badge-top--float ' +
              badgeTopFloatAlignClass(badgePos) +
              '">' +
              tierBadgeHtml(badge, "") +
              "</div>",
          );
        }
        h.push('<span class="offrefy-card__inner">');
        h.push('<div class="offrefy-tier-row">');
        h.push('<div class="offrefy-tier-main">');
        h.push('<span class="offrefy-radio-circle" aria-hidden="true"></span>');
        h.push('<div class="offrefy-tier-copy">');
        h.push('<div class="offrefy-tier-label-row">');
        h.push('<span class="offrefy-tier-qty">' + esc(localizedTierBuyLabel(d.buyLabel, c2, tiers, ui.transBuy)) + "</span>");
        if (badge && badgePos === "after_label") {
          h.push(tierBadgeHtml(badge, ""));
        }
        h.push("</div>");
        if (badge && badgePos === "below_label") {
          h.push(tierBadgeHtml(badge, "offrefy-badge-pill--row"));
        }
        var optSub =
          d.optionSubtext && String(d.optionSubtext).trim();
        if (optSub) {
          h.push(
            '<span class="offrefy-option-subtext offrefy-option-subtext--under">' +
              esc(optSub) +
              "</span>",
          );
        }
        if (badge && badgePos === "after_subtext") {
          h.push(tierBadgeHtml(badge, "offrefy-badge-pill--row"));
        }
        if (showStrikeInit) {
          h.push(
            '<span class="offrefy-tier-save offrefy-tier-save--under" data-offrefy-tier-save>' +
              esc(formatYouSaveText(P, currency, ui.transYouSave)) +
              "</span>",
          );
        } else {
          h.push('<span class="offrefy-tier-save offrefy-tier-save--under" data-offrefy-tier-save style="display:none"></span>');
        }
        h.push("</div></div>");
        h.push('<div class="offrefy-tier-prices">');
        if (badge && badgePos === "price_column") {
          h.push(tierBadgeHtml(badge, "offrefy-badge-pill--pricecol"));
        }
        if (showStrikeInit && !hideCompareInit) {
          h.push(
            '<span class="offrefy-tier-was" data-offrefy-tier-was>' +
              fmtMoney(perUnitCardsInit ? currentUnitCents : lt.original, currency) +
              "</span>",
          );
        } else {
          h.push('<span class="offrefy-tier-was" data-offrefy-tier-was style="display:none"></span>');
        }
        h.push(
          '<span class="offrefy-tier-amt" data-offrefy-main-price>' +
            fmtMoney(perUnitCardsInit ? cardUnitCents : lt.discounted, currency) +
            "</span>",
        );
        h.push("</div></div>");
        h.push(expandHtml(c2, selVariantId));
        /* Mark non-selected expands hidden at paint time (avoids flash / stale CSS :has mismatch). */
        if (c2 !== defaultIdx) {
          h[h.length - 1] = String(h[h.length - 1] || "").replace(
            'class="offrefy-card__expand"',
            'class="offrefy-card__expand" hidden',
          );
        }
        h.push("</span></div>");
      }
      h.push("</div>");
    }

    var hideVolCta = isVolumeTable && ui.hideWidgetMainCta === true;
    if (!hideVolCta) {
      h.push(
        '<button type="button" class="offrefy-cta" data-offrefy-cta>' +
          esc(ui.ctaLabel) +
          "</button>",
      );
    }
    h.push(
      '<p class="offrefy-stock-alert" data-offrefy-stock-alert hidden tabindex="-1"></p>',
    );
    h.push(
      '<p class="offrefy-cart-qty-alert offrefy-cart-qty-alert--global" data-offrefy-cart-qty-alert-global hidden tabindex="-1"></p>',
    );
    h.push('<p class="offrefy-footnote">' + esc(ui.footnote) + "</p>");
    h.push("</div>");

    /* Keep Liquid ATC bridge form across re-mount (lives inside [data-offrefy-mount]
       so it stays hidden until the widget paints — do not wipe it with innerHTML). */
    var liquidBridge =
      mountEl.querySelector("form[data-offrefy-liquid-product-form]") ||
      mountEl.querySelector("form.offrefy-liquid-product-form");
    mountEl.innerHTML = h.join("");
    if (liquidBridge) {
      mountEl.insertBefore(liquidBridge, mountEl.firstChild);
    }

    var cdEl = mountEl.querySelector("[data-offrefy-cd]");
    if (cdEl && cdLive) {
      var cdWrap = cdEl.closest(".offrefy-countdown");
      var tickCd = function () {
        var now = Date.now();
        // Countdown always targets end — schedule start only gates offer status, not the pill.
        if (cdWrap) cdWrap.style.display = "";
        var left = Math.max(0, Math.floor((cdEndsMs - now) / 1000));
        cdEl.textContent = formatCountdown(left, ui.countdownTimeUnit);
      };
      tickCd();
      var iv = setInterval(tickCd, 1000);
      root.setAttribute("data-offrefy-cd-iv", String(iv));
    }

    var initVid = selVariantId;
    currentUnitCents = readPriceForVariant(initVid);
    syncAllVariantSelects(initVid);
    updateAllPrices();
    stateQty = Math.max(1, tiers[defaultIdx].minQty | 0);
    updateQtyDisplay();
    syncSelectedCard();
    updatePurchaseControlsAvailability();
    /* Force one expand only — class + radio can desync after back/checkout. */
    syncSelectedCard();

    mountEl.addEventListener("input", function (ev) {
      var t = ev.target;
      if (
        !t ||
        !t.getAttribute ||
        t.getAttribute("data-offrefy-qty-display") == null ||
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
        t.getAttribute("data-offrefy-qty-display") != null &&
        t.tagName === "INPUT"
      ) {
        /* Commit typed qty; selectCard only snaps when the tier actually changes. */
        ensureCardSelectedFromNode(t);
        applyQtyFromInput(t);
        return;
      }
      if (
        vdShowVariant &&
        t &&
        t.getAttribute &&
        t.getAttribute("data-offrefy-vd-vsel-input") != null
      ) {
        if (ensureCardSelectedFromNode(t)) {
          stateQty = getTierMinQty();
        }
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
        t.getAttribute("data-offrefy-qty-display") == null ||
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
        t.getAttribute("data-offrefy-qty-display") == null ||
        t.tagName !== "INPUT"
      ) {
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        t.blur();
      }
    });

    function isExpandControlTarget(t) {
      return !!(
        t &&
        t.closest &&
        t.closest(
          "[data-offrefy-vd-vsel], .offrefy-vd-vsel, [data-offrefy-qty-dec], [data-offrefy-qty-inc], [data-offrefy-tier-add], [data-offrefy-qty-display], .offrefy-qty-group, .offrefy-qty-btn, .offrefy-add-outline",
        )
      );
    }

    function applyVdVariantChoice(vid, fromNode) {
      var v = String(vid || "");
      if (!v) return;
      if (fromNode && ensureCardSelectedFromNode(fromNode)) {
        stateQty = getTierMinQty();
      }
      currentUnitCents = readPriceForVariant(v);
      syncAllVariantSelects(v);
      closeAllVdVariantPickers();
      updateAllPrices();
      updateQtyDisplay();
      syncFormVariant(v);
      root.setAttribute("data-variant-id", v);
      updatePurchaseControlsAvailability();
    }

    mountEl.addEventListener(
      "pointerdown",
      function (ev) {
        if (isVolumeTable) return;
        /* Never intercept variant picker / qty — card selectCard blocks controls. */
        if (isExpandControlTarget(ev.target)) return;
        var card =
          ev.target && ev.target.closest
            ? ev.target.closest(".offrefy-card")
            : null;
        if (!card || !mountEl.contains(card)) return;
        closeAllVdVariantPickers();
        /* Select immediately on press so text-drag / theme handlers cannot steal tier 2/3 clicks. */
        selectCard(card, true);
      },
      true,
    );

    mountEl.addEventListener("keydown", function (ev) {
      if (isVolumeTable) return;
      if (isExpandControlTarget(ev.target)) return;
      var card =
        ev.target && ev.target.closest
          ? ev.target.closest(".offrefy-card")
          : null;
      if (!card || ev.target !== card) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      selectCard(card, true);
    });

    mountEl.addEventListener("click", function (ev) {
      var t = ev.target;
      if (vdShowVariant && t && t.closest) {
        var trigger = t.closest("[data-offrefy-vd-vsel-trigger]");
        if (trigger && mountEl.contains(trigger)) {
          ev.preventDefault();
          ev.stopPropagation();
          var box = trigger.closest("[data-offrefy-vd-vsel]");
          if (!box) return;
          var panel = box.querySelector("[data-offrefy-vd-vsel-panel]");
          var open = box.classList.contains("is-open");
          closeAllVdVariantPickers();
          if (!open && panel) {
            trigger.setAttribute("aria-expanded", "true");
            box.classList.add("is-open");
            portalVdVariantPanel(box, panel, trigger);
            panel.removeAttribute("hidden");
            setupVdPortalListeners();
          }
          ensureCardSelectedFromNode(trigger);
          return;
        }
        var opt = t.closest("[data-offrefy-vd-vid]");
        if (opt && mountEl.contains(opt) && !opt.disabled) {
          ev.preventDefault();
          ev.stopPropagation();
          applyVdVariantChoice(opt.getAttribute("data-offrefy-vd-vid"), opt);
          return;
        }
      }

      if (!isVolumeTable && !isExpandControlTarget(ev.target)) {
        var clickCard =
          ev.target && ev.target.closest
            ? ev.target.closest(".offrefy-card")
            : null;
        if (clickCard) {
          closeAllVdVariantPickers();
          selectCard(clickCard, false);
        }
      }
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-offrefy-qty-dec],[data-offrefy-qty-inc],[data-offrefy-tier-add]") : null;
      if (!btn) return;
      if (btn.hasAttribute("data-offrefy-qty-dec")) {
        ev.preventDefault();
        var mq = getTierMinQty();
        stateQty = Math.max(mq, stateQty - 1);
        updateQtyDisplay();
        return;
      }
      if (btn.hasAttribute("data-offrefy-qty-inc")) {
        ev.preventDefault();
        stateQty = Math.min(VD_MAX_LINE_QTY, stateQty + 1);
        updateQtyDisplay();
        return;
      }
      if (btn.hasAttribute("data-offrefy-tier-add")) {
        ev.preventDefault();
        ev.stopPropagation();
        clampQty();
        syncQtyToForm(false);
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
          .then(function (addResult) {
            recordAddToCartAnalytics(qtyAdd, vidAdd);
            clearVdCartQtyAlert();
            return completeAfterCartAdd(ui, addResult);
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

    if (!offrefyNs()._offrefyVdVselOutsideClose) {
      offrefyNs()._offrefyVdVselOutsideClose = true;
      document.addEventListener(
        "pointerdown",
        function (ev) {
          var open = document.querySelector(
            "[data-offrefy-root] [data-offrefy-vd-vsel].is-open",
          );
          if (!open) return;
          if (
            ev.target &&
            ev.target.closest &&
            (ev.target.closest("[data-offrefy-vd-vsel]") ||
              ev.target.closest(".offrefy-vd-vsel__panel.is-portaled"))
          ) {
            return;
          }
          var roots = document.querySelectorAll(
            "[data-offrefy-root] [data-offrefy-mount]",
          );
          for (var ri = 0; ri < roots.length; ri++) {
            var boxes = roots[ri].querySelectorAll(
              "[data-offrefy-vd-vsel].is-open",
            );
            for (var bi = 0; bi < boxes.length; bi++) {
              var panel = boxes[bi].querySelector("[data-offrefy-vd-vsel-panel]");
              if (!panel) {
                var portaled = document.querySelectorAll(
                  ".offrefy-vd-vsel__panel.is-portaled",
                );
                for (var pi = 0; pi < portaled.length; pi++) {
                  if (portaled[pi]._offrefyOwnerBox === boxes[bi]) {
                    panel = portaled[pi];
                    break;
                  }
                }
              }
              var trig = boxes[bi].querySelector(
                "[data-offrefy-vd-vsel-trigger]",
              );
              if (panel) {
                panel.setAttribute("hidden", "");
                if (panel.classList.contains("is-portaled")) {
                  var home = panel._offrefyPortalHome;
                  panel.classList.remove("is-portaled", "is-dropup");
                  panel.style.removeProperty("top");
                  panel.style.removeProperty("left");
                  panel.style.removeProperty("right");
                  panel.style.removeProperty("width");
                  panel.style.removeProperty("bottom");
                  panel.style.removeProperty("max-height");
                  panel._offrefyOnPick = null;
                  panel._offrefyClose = null;
                  panel._offrefyOwnerBox = null;
                  panel._offrefyOwnerMount = null;
                  panel._offrefyPortalHome = null;
                  if (home && home.parent) {
                    if (
                      home.nextSibling &&
                      home.nextSibling.parentNode === home.parent
                    ) {
                      home.parent.insertBefore(panel, home.nextSibling);
                    } else {
                      home.parent.appendChild(panel);
                    }
                  }
                }
              }
              if (trig) trig.setAttribute("aria-expanded", "false");
              boxes[bi].classList.remove("is-open");
            }
            var cardsWrap = roots[ri].querySelector(".offrefy-cards");
            if (cardsWrap) cardsWrap.classList.remove("offrefy-cards--vsel-open");
            var rootEl = roots[ri].closest("[data-offrefy-root]");
            if (rootEl) rootEl.classList.remove("offrefy-theme--vsel-open");
          }
        },
        true,
      );
      document.addEventListener(
        "click",
        function (ev) {
          var panel =
            ev.target &&
            ev.target.closest &&
            ev.target.closest(".offrefy-vd-vsel__panel.is-portaled");
          if (!panel) return;
          var opt =
            ev.target.closest && ev.target.closest("[data-offrefy-vd-vid]");
          if (!opt || opt.disabled) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof panel._offrefyOnPick === "function") {
            panel._offrefyOnPick(opt.getAttribute("data-offrefy-vd-vid"), opt);
          }
        },
        true,
      );
    }

    var cta = mountEl.querySelector("[data-offrefy-cta]");
    if (cta) {
      cta.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        clampQty();
        syncQtyToForm(false);
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
          .then(function (addResult) {
            recordAddToCartAnalytics(stateQty, vidC);
            clearVdCartQtyAlert();
            return completeAfterCartAdd(ui, addResult);
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

    /*
     * Theme ATC (form[action*="/cart/add"] [type="submit"]): sync widget qty/variant
     * into the form before Valor/Dawn AJAX FormData runs — covers direct theme clicks.
     */
    var themeCartForm = findThemeProductCartForm();
    if (themeCartForm && themeCartForm.getAttribute("data-offrefy-theme-sync") !== "1") {
      themeCartForm.setAttribute("data-offrefy-theme-sync", "1");
      themeCartForm.addEventListener(
        "submit",
        function () {
          if (!root.isConnected || root.getAttribute("data-offrefy-ready") !== "1") {
            return;
          }
          clampQty();
          var vidTheme = resolveActiveVariantIdForCart();
          if (!vidTheme || !isVariantAvailableForCart(vidTheme)) return;
          syncThemeCartAddForm(
            themeCartForm,
            vidTheme,
            stateQty,
            offrefyAttribution,
          );
        },
        true,
      );
    }

    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.removeProperty("margin");
    root.style.removeProperty("padding");
    root.style.removeProperty("min-height");
    root.setAttribute("data-offrefy-ready", "1");
    mountEl.hidden = false;
    root.setAttribute("data-offrefy-inited", "1");
    /* Re-apply after paint — themes often hydrate variant pills late. */
    applyThemeFormVisibility(ui, { clearWhenOff: true });
    setTimeout(function () {
      applyThemeFormVisibility(ui, { clearWhenOff: true });
    }, 400);
    setTimeout(function () {
      applyThemeFormVisibility(ui, { clearWhenOff: true });
    }, 1200);
    setTimeout(function () {
      applyThemeFormVisibility(ui, { clearWhenOff: true });
    }, 2500);
    trackImpression(campaign, root.getAttribute("data-product-id"));
    offrefyNs().embed = offrefyNs().embed || {};
    offrefyNs().embed.version = "1.31.13";

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
    var ctCode = String(rule.ct || "e");
    var customerType =
      ctCode === "l"
        ? "logged-in"
        : ctCode === "t"
          ? "logged-in-tag-any"
          : "everyone";
    var customerTags = Array.isArray(rule.tg)
      ? rule.tg.filter(function (x) {
          return typeof x === "string" && x.trim();
        })
      : [];
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
      customerType: customerType,
      customerTags: customerTags,
      productIds: [],
      tiers: tiers,
      widgetDisplay: {
        showCountdown: rule.sc === 1 || rule.sc === true,
        countdownLabel:
          typeof rule.cl === "string" && rule.cl.trim()
            ? String(rule.cl).trim()
            : WD_DEFAULT.countdownLabel,
        countdownTimeAmount: (function () {
          var amt = Math.floor(Number(rule.ca));
          if (!isFinite(amt) || amt < 1) return 1;
          return Math.min(9999, amt);
        })(),
        countdownTimeUnit:
          rule.cu === "h" ? "hours" : rule.cu === "m" ? "minutes" : "days",
      },
      _fromProductRule: true,
      _scheduleAware:
        rule.sv === 1 ||
        Object.prototype.hasOwnProperty.call(rule, "sa") ||
        Object.prototype.hasOwnProperty.call(rule, "ea"),
      countdownStartsAt:
        rule.sa != null && Number(rule.sa) > 0
          ? new Date(Number(rule.sa) * 1000).toISOString()
          : null,
      countdownEndsAt:
        rule.ea != null && Number(rule.ea) > 0
          ? new Date(Number(rule.ea) * 1000).toISOString()
          : null,
    };
  }

  function readCompactProductRule(root) {
    var el = root && root.querySelector("script[data-offrefy-product-rule]");
    if (!el) return null;
    try {
      return expandCompactProductRule(JSON.parse(String(el.textContent || "").trim()));
    } catch (e) {
      return null;
    }
  }

  function runWidget(root) {
    if (root.getAttribute("data-offrefy-inited") === "1") return;
    var configId = root.getAttribute("data-config-id");
    var mount = root.querySelector("[data-offrefy-mount]");
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
            root.removeAttribute("data-offrefy-inited");
            runWidget(root);
          },
        );
        return;
      }
    }

    function applyConfig(cfg) {
      var camp = pickCampaign(cfg, productId, variantId, productGid, variantGid);
      if (
        (!camp || !camp.tiers || !camp.tiers.length) &&
        productRuleCampaign &&
        campaignUsableOnStorefront(productRuleCampaign)
      ) {
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
        root.setAttribute("hidden", "");
        root.style.display = "none";
        root.style.margin = "0";
        root.style.padding = "0";
        root.style.minHeight = "0";
        root.removeAttribute("data-offrefy-ready");
        mount.hidden = true;
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

    if (
      (!matched || !matched.tiers || !matched.tiers.length) &&
      productRuleCampaign &&
      campaignUsableOnStorefront(productRuleCampaign)
    ) {
      matched = productRuleCampaign;
    }

    if (matched && matched.tiers && matched.tiers.length) {
      if (inline && inline.translations) {
        matched.translations = inline.translations;
      }
      // Product-rule early paint lacks full widgetDisplay — still fetch /widget-config
      // so countdown + appearance from the offer are applied.
      if (!matched._fromProductRule) {
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
    }

    function finishFetch(remote) {
      if (!root.isConnected) return;
      var hadProductRulePaint =
        root.getAttribute("data-offrefy-inited") === "1" &&
        productRuleCampaign;
      if (root.getAttribute("data-offrefy-inited") === "1" && !hadProductRulePaint) {
        return;
      }
      if (hadProductRulePaint) {
        clearCountdown(root);
        root.removeAttribute("data-offrefy-inited");
      }
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
    if (document.querySelector('link[data-offrefy-hosted-css="1"]')) return;
    if (document.querySelector('link[href*="volume-discount-storefront.css"]')) return;
    var origin =
      (typeof offrefyNs().appOrigin === "string" && offrefyNs().appOrigin) ||
      "https://offrey.xloxi.com";
    var ver =
      (typeof offrefyNs().assetVersion === "string" && offrefyNs().assetVersion) ||
      "1.30.6";
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      String(origin).replace(/\/$/, "") +
      "/vd-storefront.css?v=" +
      encodeURIComponent(ver);
    link.setAttribute("data-offrefy-hosted-css", "1");
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
   * “Quantity breaks” theme block (that block also injects JS/CSS).
   */
  function ensureAutoinjectRoot() {
    return null;
  }

  function hideAllWidgetRoots() {
    document.querySelectorAll(".offrefy-root").forEach(function (el) {
      el.setAttribute("hidden", "");
      el.style.display = "none";
      el.style.margin = "0";
      el.removeAttribute("data-offrefy-ready");
      el.removeAttribute("data-offrefy-inited");
      var mount = el.querySelector("[data-offrefy-mount]");
      if (mount) mount.hidden = true;
    });
  }

  function scan(options) {
    var opts = options || {};
    var syncCartSideEffects = opts.syncCart !== false;

    /* App embed off → never mount (block markup alone must not show the widget). */
    if (!offrefyNs().appEmbedActive) {
      hideAllWidgetRoots();
      return;
    }

    /* Widget first — never wait on cart network before mounting. */
    document.querySelectorAll(".offrefy-root").forEach(function (el) {
      runWidget(el);
    });

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
  /* Browser Back/Forward (checkout -> product) can restore stale card DOM via bfcache.
     Clear inited flags so widgets remount with a single selected expand. */
  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted) {
      document.querySelectorAll(".offrefy-root[data-offrefy-inited]").forEach(function (el) {
        el.removeAttribute("data-offrefy-inited");
        el.removeAttribute("data-offrefy-ready");
      });
    }
    scan({ syncCart: false });
  });
})();

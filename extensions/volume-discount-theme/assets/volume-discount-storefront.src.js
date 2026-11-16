import EmblaCarousel from "embla-carousel";

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
    var sameOrigin = [];
    var crossOrigin = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      if (String(candidates[ci]).indexOf("://") !== -1) {
        crossOrigin.push(candidates[ci]);
      } else {
        sameOrigin.push(candidates[ci]);
      }
    }
    function fetchCandidate(url) {
      var cross = String(url).indexOf("://") !== -1;
      return fetch(url, {
        credentials: cross ? "omit" : "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
        .then(parseWidgetConfigResponse)
        .catch(function () {
          return null;
        });
    }
    var sameOriginPromises = [];
    for (var si = 0; si < sameOrigin.length; si++) {
      sameOriginPromises.push(fetchCandidate(sameOrigin[si]));
    }

    /* Same-origin app proxy first. The direct app host is only a fallback,
       so a missing CORS header does not print an error when the proxy works. */
    var promise = raceUsableConfigs(
      [prefetchPromise].concat(sameOriginPromises),
    )
      .then(function (body) {
        if (isUsableWidgetConfig(body) || !crossOrigin.length) return body;
        var crossPromises = [];
        for (var xi = 0; xi < crossOrigin.length; xi++) {
          crossPromises.push(fetchCandidate(crossOrigin[xi]));
        }
        return raceUsableConfigs(crossPromises);
      })
      .then(function (body) {
        if (isUsableWidgetConfig(body)) return body;
        fetchPromiseByKey.delete(key);
        if (pid) fetchPromiseByProductId.delete(pid);
        return { version: 1, campaigns: [] };
      });

    fetchPromiseByKey.set(key, promise);
    if (pid) fetchPromiseByProductId.set(pid, promise);
    return promise;
  }

  /**
   * Never attach Offrefy keys as line item properties — Shopify admin always
   * shows them on the order. Attribution is analytics ATC events (+ discount
   * title / product→campaign resolve on the server).
   */
  function offrefyCartProperties() {
    return null;
  }

  function applyOffrefyPropertiesToForm(form) {
    if (!form) return;
    var existing = form.querySelectorAll("[data-offrefy-prop]");
    for (var ei = 0; ei < existing.length; ei++) {
      existing[ei].remove();
    }
  }

  /**
   * Do not write Offrefy keys onto cart attributes — they become order
   * "Additional details". Sales attribution uses ATC analytics events.
   */
  function syncOffrefyCartAttributes() {
    return Promise.resolve();
  }

  var VD_ATC_ATTR_SESSION_KEY = "vd_atc_attribution";

  function rememberAtcAttribution(campaignId, productId, variantId) {
    if (!campaignId) return;
    try {
      var map = {};
      try {
        map = JSON.parse(sessionStorage.getItem(VD_ATC_ATTR_SESSION_KEY) || "{}") || {};
      } catch (eParse) {
        map = {};
      }
      var key = String(variantId || productId || "");
      if (!key) return;
      map[key] = {
        campaignId: String(campaignId),
        productId: productId ? String(productId) : undefined,
        variantId: variantId ? String(variantId) : undefined,
        t: Date.now(),
      };
      sessionStorage.setItem(VD_ATC_ATTR_SESSION_KEY, JSON.stringify(map));
    } catch (e) {
      void e;
    }
  }

  /** Re-send ATC beacons before checkout so order matching stays reliable. */
  function flushAtcAttributionBeacons() {
    try {
      var raw = sessionStorage.getItem(VD_ATC_ATTR_SESSION_KEY);
      if (!raw) return;
      var map = JSON.parse(raw) || {};
      for (var key in map) {
        if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
        var row = map[key];
        if (!row || !row.campaignId) continue;
        trackAnalyticsEvent({
          type: "add_to_cart",
          campaignId: String(row.campaignId),
          productId: row.productId ? String(row.productId) : undefined,
          variantId: row.variantId ? String(row.variantId) : undefined,
        });
      }
    } catch (e) {
      void e;
    }
  }

  function bindAtcAttributionFlush() {
    if (offrefyNs().atcAttrFlushBound) return;
    offrefyNs().atcAttrFlushBound = true;
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var a = t.closest('a[href*="/checkout"], button[name="checkout"], [name="checkout"]');
        if (!a) return;
        flushAtcAttributionBeacons();
      },
      true,
    );
    window.addEventListener("pagehide", flushAtcAttributionBeacons);
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
    rememberAtcAttribution(campaign.id, productId, variantId);
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

  function productMatch(campaign, productId, variantId, productGid, variantGid, collectionGids) {
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
    var campCols = campaign.collectionIds || [];
    if (campCols.length && collectionGids && collectionGids.length) {
      var colSet = {};
      for (var ci = 0; ci < collectionGids.length; ci++) {
        colSet[String(collectionGids[ci])] = true;
      }
      for (var cj = 0; cj < campCols.length; cj++) {
        var cid = String(campCols[cj] || "");
        if (!cid) continue;
        if (colSet[cid]) return true;
        for (var ck in colSet) {
          if (
            Object.prototype.hasOwnProperty.call(colSet, ck) &&
            (ck.indexOf(cid) !== -1 || cid.indexOf(ck) !== -1)
          ) {
            return true;
          }
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

  function readCollectionGidsFromRoot(root) {
    if (!root) return [];
    var raw = root.getAttribute("data-collection-gids") || "";
    if (!raw) return [];
    try {
      if (raw.charAt(0) === "[") {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean);
        }
      }
    } catch (e) {
      /* fall through */
    }
    return raw
      .split(",")
      .map(function (s) {
        return String(s || "").trim();
      })
      .filter(Boolean);
  }

  function campaignPickScore(campaign) {
    if (isBogoCampaign(campaign)) return 3;
    var scope = String((campaign && campaign.productScope) || "");
    if (scope === "specific-products" || scope === "products") return 2;
    if (scope === "collections") return 1;
    return 0;
  }

  function pickCampaign(cfg, productId, variantId, productGid, variantGid, collectionGids) {
    var list = (cfg && cfg.campaigns) || [];
    var cols = collectionGids || [];
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      if (!campaignInScheduleWindow(list[i])) continue;
      if (!customerAllowsCampaign(list[i])) continue;
      if (
        !productMatch(
          list[i],
          productId,
          variantId,
          productGid,
          variantGid,
          cols,
        )
      ) {
        continue;
      }
      var score = campaignPickScore(list[i]);
      if (score > bestScore) {
        best = list[i];
        bestScore = score;
      }
    }
    return best;
  }

  function isBogoCampaign(campaign) {
    return (
      campaign &&
      (campaign.offerKind === "bogo" ||
        (campaign.bogo && typeof campaign.bogo === "object"))
    );
  }

  function bogoIdNumericTail(id) {
    var s = String(id || "");
    var m = s.match(/\/(\d+)\s*$/);
    if (m) return m[1];
    if (/^\d+$/.test(s)) return s;
    return "";
  }

  function bogoProductIdInList(productId, list) {
    var p = String(productId || "");
    if (!p || !Array.isArray(list) || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] || "");
      if (!id) continue;
      if (id === p) return true;
      if (id.indexOf("/Product/" + p) !== -1) return true;
      if (bogoIdNumericTail(id) === p) return true;
    }
    return false;
  }

  /**
   * Same-product Buy X Get Y: Shopify BXGY needs buyQty+getQty in cart
   * (one paid + free/discounted). Classic Buy 1 Get 1 → qty 2.
   */
  function bogoSameProductQuantityDeal(campaign, productId) {
    var bogo = campaign && campaign.bogo;
    if (!bogo || bogo.buysRequirement === "amount") return null;
    if (bogo.buysScope === "collections" || bogo.getsScope === "collections") {
      return null;
    }
    var buysIds = bogo.buysProductIds || [];
    var getsIds = bogo.getsProductIds || [];
    var inBuys =
      bogoProductIdInList(productId, buysIds) ||
      (!buysIds.length &&
        bogoProductIdInList(productId, campaign.productIds || []));
    var inGets =
      bogoProductIdInList(productId, getsIds) ||
      (!getsIds.length &&
        bogoProductIdInList(productId, campaign.productIds || []));
    if (!inBuys || !inGets) return null;
    var buysQty = Math.max(1, Number(bogo.buysQuantity) || 1);
    var getsQty = Math.max(1, Number(bogo.getsQuantity) || 1);
    return { buysQty: buysQty, getsQty: getsQty, needQty: buysQty + getsQty };
  }

  /**
   * True when BOGO tiles can paint without a later /widget-config remount flash
   * (cross-product Get needs image + priceCents; same-SKU can use page product).
   */
  function bogoCampaignHasStableTileMedia(campaign, productId) {
    if (!campaign || !campaign.bogo) return false;
    if (bogoSameProductQuantityDeal(campaign, productId)) return true;
    var bogo = campaign.bogo;
    var buys0 =
      Array.isArray(bogo.buysLines) && bogo.buysLines[0]
        ? bogo.buysLines[0]
        : null;
    var gets0 =
      Array.isArray(bogo.getsLines) && bogo.getsLines[0]
        ? bogo.getsLines[0]
        : null;
    if (!gets0) return false;
    var getOk =
      String(gets0.title || "").trim() &&
      String(gets0.imageUrl || "").trim() &&
      Number(gets0.priceCents) > 0;
    if (!getOk) return false;
    /* Buy tile can fall back to page product; prefer buysLines when present. */
    if (!buys0) return true;
    return (
      String(buys0.title || "").trim() &&
      (String(buys0.imageUrl || "").trim() || Number(buys0.priceCents) > 0)
    );
  }

  function paintBogoPendingSkeleton(mountEl) {
    if (!mountEl) return;
    if (
      mountEl.querySelector(".offrefy-bogo") ||
      mountEl.querySelector("[data-offrefy-bogo-shadow]")
    ) {
      return;
    }
    mountEl.hidden = false;
    try {
      var host = mountEl.closest && mountEl.closest("[data-offrefy-root]");
      if (host && host.classList) host.classList.add("offrefy-bogo-host");
    } catch (eHost) {}
    mountEl.innerHTML =
      '<div class="offrefy-bogo offrefy-bogo--pending" aria-busy="true" aria-hidden="true"></div>';
  }

  function cartQtyForVariant(cart, variantId) {
    var lines = collectCartLinesForVariant(cart, variantId);
    var total = 0;
    for (var i = 0; i < lines.length; i++) {
      total += lines[i].qty;
    }
    return total;
  }

  function readFormVariantId(form) {
    if (!form) return "";
    var sel = form.querySelector('select[name="id"]');
    if (sel && sel.value) return String(sel.value);
    var input = form.querySelector('input[name="id"]');
    if (input && input.value) return String(input.value);
    return "";
  }

  function bumpBogoFormQuantity(form, qty) {
    var n = Math.min(VD_MAX_LINE_QTY, Math.max(1, Number(qty) || 1));
    ensureThemeFormQuantity(form, n);
    var inputs = form.querySelectorAll('input[name="quantity"], select[name="quantity"]');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].value = String(n);
      try {
        inputs[i].dispatchEvent(new Event("change", { bubbles: true }));
        inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e) {
        void e;
      }
    }
    return n;
  }

  function cartQtyForProductIds(cart, productIds) {
    if (!cart || !Array.isArray(cart.items) || !Array.isArray(productIds)) {
      return 0;
    }
    var total = 0;
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (!item) continue;
      var pid = String(item.product_id || "");
      if (!pid) continue;
      if (bogoProductIdInList(pid, productIds)) {
        total += Math.max(0, Number(item.quantity) || 0);
      }
    }
    return total;
  }

  function numericIdFromGid(gid) {
    var s = String(gid || "");
    var m = s.match(/\/(\d+)\s*$/);
    return m ? m[1] : /^\d+$/.test(s) ? s : "";
  }

  /** True when Buy and Get product lists are the same pool (classic same-SKU BXGY). */
  function bogoIsIdenticalBuyGetProducts(bogo) {
    if (!bogo || bogo.buysScope === "collections" || bogo.getsScope === "collections") {
      return false;
    }
    var buys = bogo.buysProductIds || [];
    var gets = bogo.getsProductIds || [];
    if (!buys.length || !gets.length || buys.length !== gets.length) return false;
    for (var i = 0; i < gets.length; i++) {
      if (!bogoProductIdInList(bogoIdNumericTail(gets[i]) || gets[i], buys)) {
        return false;
      }
    }
    return true;
  }

  function collectCartLinesForVariant(cart, variantId) {
    var vid = String(variantId || "");
    var lines = [];
    if (!vid || !cart || !Array.isArray(cart.items)) return lines;
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (!item) continue;
      var itemVid = String(
        item.variant_id != null && item.variant_id !== ""
          ? item.variant_id
          : item.id || "",
      );
      if (itemVid !== vid) continue;
      var key = item.key != null && String(item.key) ? String(item.key) : "";
      var q = Math.max(0, Number(item.quantity) || 0);
      lines.push({
        key: key,
        line: i + 1,
        qty: q,
        price: Math.max(
          0,
          Number(item.final_line_price || item.line_price) || 0,
        ),
      });
    }
    return lines;
  }

  /**
   * @deprecated Line indexes go stale and cause "line parameter is invalid".
   * BOGO paths must use bogoCartChangeByKey / cart/update.js only.
   */
  function bogoCartChangeByLine(lineNum, quantity) {
    void lineNum;
    void quantity;
    return Promise.resolve(null);
  }

  function bogoCartChangeByKey(lineKey, quantity) {
    if (!lineKey) return Promise.resolve(null);
    return fetch(shopifyRoutesRoot() + "cart/change.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: String(lineKey),
        quantity: Math.max(0, Number(quantity) || 0),
      }),
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            if (!r.ok) return null;
            return data;
          });
      })
      .catch(function () {
        return null;
      });
  }

  /** Zero many line keys in one cart/update.js call (avoids stale line indexes). */
  function bogoCartZeroKeys(keys) {
    var list = (keys || []).filter(Boolean);
    if (!list.length) return Promise.resolve(null);
    var updates = {};
    for (var i = 0; i < list.length; i++) updates[String(list[i])] = 0;
    return bogoCartUpdateLines(updates);
  }

  /** Group cart lines by variant_id (includes lines without keys). */
  function groupCartLinesByVariant(cart) {
    var groups = {};
    if (!cart || !Array.isArray(cart.items)) return groups;
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (!item) continue;
      var vid = String(
        item.variant_id != null && item.variant_id !== ""
          ? item.variant_id
          : item.id || "",
      );
      if (!vid) continue;
      if (!groups[vid]) groups[vid] = [];
      groups[vid].push({
        key: item.key != null && String(item.key) ? String(item.key) : "",
        qty: Math.max(0, Number(item.quantity) || 0),
        line: i + 1,
        price: Math.max(
          0,
          Number(item.final_line_price || item.line_price) || 0,
        ),
      });
    }
    return groups;
  }

  function cartHasDuplicateVariants(cart) {
    var groups = groupCartLinesByVariant(cart);
    var vids = Object.keys(groups);
    for (var i = 0; i < vids.length; i++) {
      if (groups[vids[i]].length > 1) return true;
    }
    return false;
  }

  /** Build { lineKey: qty } map collapsing every duplicate variant into one line. */
  function buildBogoMergeUpdates(cart) {
    var updates = {};
    var groups = groupCartLinesByVariant(cart);
    var vids = Object.keys(groups);
    for (var gi = 0; gi < vids.length; gi++) {
      var lines = groups[vids[gi]];
      if (lines.length <= 1) continue;
      var keyed = lines.filter(function (l) {
        return !!l.key;
      });
      if (keyed.length <= 1) continue;
      keyed.sort(function (a, b) {
        return a.line - b.line;
      });
      var total = 0;
      for (var li = 0; li < lines.length; li++) total += lines[li].qty;
      updates[keyed[0].key] = total;
      for (var lj = 1; lj < keyed.length; lj++) {
        updates[keyed[lj].key] = 0;
      }
    }
    return updates;
  }

  function bogoCartUpdateLines(updates) {
    var keys = updates ? Object.keys(updates) : [];
    if (!keys.length) return Promise.resolve(null);
    return fetch(shopifyRoutesRoot() + "cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ updates: updates }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function fetchCartJsSilent() {
    return fetch(cartJsUrl(), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * Collapse one variant's duplicate lines → single line with combined qty.
   * Keys only — never line indexes ("line parameter is invalid").
   */
  function mergeOneVariantLines(cart, variantId) {
    var vid = String(variantId || "");
    if (!vid || !cart) return Promise.resolve(cart);
    var lines = collectCartLinesForVariant(cart, vid);
    if (lines.length <= 1) return Promise.resolve(cart);
    lines.sort(function (a, b) {
      return a.line - b.line;
    });
    var total = 0;
    for (var i = 0; i < lines.length; i++) total += lines[i].qty;
    total = Math.min(VD_MAX_LINE_QTY, Math.max(0, total));

    var keyed = lines.filter(function (l) {
      return !!l.key;
    });
    if (!keyed.length) {
      /* No keys — wipe via variant clear+readd. */
      return forceReaddVariantAsSingleLine(cart, vid, total);
    }

    var updates = {};
    updates[keyed[0].key] = total;
    for (var li = 1; li < keyed.length; li++) {
      updates[keyed[li].key] = 0;
    }
    return bogoCartUpdateLines(updates).then(function () {
      return fetchCartJsSilent().then(function (fresh) {
        var next = fresh || cart;
        if (collectCartLinesForVariant(next, vid).length <= 1) return next;
        /* update.js blocked — sequential change.js by key */
        var chain = Promise.resolve(null);
        for (var ri = 1; ri < keyed.length; ri++) {
          (function (line) {
            chain = chain.then(function () {
              return bogoCartChangeByKey(line.key, 0);
            });
          })(keyed[ri]);
        }
        return chain
          .then(function () {
            return bogoCartChangeByKey(keyed[0].key, total);
          })
          .then(function () {
            return fetchCartJsSilent();
          })
          .then(function (after) {
            if (collectCartLinesForVariant(after, vid).length <= 1) {
              return after;
            }
            return forceReaddVariantAsSingleLine(after || next, vid, total);
          });
      });
    });
  }

  /**
   * Collapse duplicate cart lines for one variant into a single line.
   */
  function mergeDuplicateVariantLines(cart, variantId) {
    return mergeOneVariantLines(cart, variantId).then(function (next) {
      return fetchCartAndRefresh().then(function () {
        return next;
      });
    });
  }

  /** Lower Get-variant qty to needQty (paid lines first). */
  function trimBogoGetVariantToNeed(cart, variantId, needQty) {
    return setBogoGetVariantToNeed(cart, variantId, needQty);
  }

  /**
   * Cross-product Get lines are app-managed ("we'll add the Get item").
   * Force that variant to exactly needQty (0 = remove all) — never leave
   * extra paid Coca-Cola units from a bad auto-add.
   */
  function setBogoGetVariantToNeed(cart, variantId, needQty) {
    var vid = String(variantId || "");
    var need = Math.max(0, Math.min(VD_MAX_LINE_QTY, Number(needQty) || 0));
    if (!vid) return Promise.resolve(cart);

    var lines = collectCartLinesForVariant(cart, vid);
    var have = 0;
    for (var i = 0; i < lines.length; i++) have += lines[i].qty;
    if (have === need && lines.length <= 1) return Promise.resolve(cart);

    if (need <= 0) {
      var keys = lines.map(function (l) {
        return l.key;
      }).filter(Boolean);
      if (!keys.length) return Promise.resolve(cart);
      return bogoCartZeroKeys(keys).then(function () {
        return fetchCartJsSilent();
      });
    }

    if (!lines.length) {
      return addBogoPlainCartAdd(vid, need).then(function () {
        return fetchCartJsSilent();
      });
    }

    if (lines.length === 1 && lines[0] && lines[0].key) {
      return bogoCartChangeByKey(lines[0].key, need).then(function () {
        return fetchCartJsSilent();
      });
    }

    /* Multiple Get lines: zero extras by key, set first to need — no wipe+readd. */
    var keyed = lines.filter(function (l) {
      return !!l.key;
    });
    if (!keyed.length) {
      return addBogoPlainCartAdd(vid, need).then(function () {
        return fetchCartJsSilent();
      });
    }
    var upd = {};
    upd[keyed[0].key] = need;
    for (var gi = 1; gi < keyed.length; gi++) {
      upd[keyed[gi].key] = 0;
    }
    return bogoCartUpdateLines(upd).then(function () {
      return fetchCartJsSilent();
    });
  }

  /**
   * Nuclear collapse for property-split lines (Boga 2+5 → one Boga 7).
   * Wipe every line key of the variant, then re-add one clean line (no props).
   * Never uses line indexes (avoids "line parameter is invalid").
   */
  function forceReaddVariantAsSingleLine(cart, variantId, desiredTotal) {
    var vid = String(variantId || "");
    if (!vid || !cart) return Promise.resolve(cart);
    var lines = collectCartLinesForVariant(cart, vid);
    var summed = 0;
    for (var i = 0; i < lines.length; i++) summed += lines[i].qty;
    var total =
      desiredTotal != null && Number.isFinite(Number(desiredTotal))
        ? Math.max(0, Number(desiredTotal))
        : summed;
    total = Math.min(VD_MAX_LINE_QTY, total);
    if (total < 1 && lines.length === 0) return Promise.resolve(cart);

    var keys = lines
      .map(function (l) {
        return l.key;
      })
      .filter(Boolean);

    var wipe =
      keys.length > 0
        ? bogoCartZeroKeys(keys)
        : Promise.resolve(null);

    return wipe
      .then(function () {
        return fetchCartJsSilent();
      })
      .then(function (cleared) {
        var left = collectCartLinesForVariant(cleared, vid);
        var leftKeys = left
          .map(function (l) {
            return l.key;
          })
          .filter(Boolean);
        if (!leftKeys.length) return cleared;
        return bogoCartZeroKeys(leftKeys).then(function () {
          return fetchCartJsSilent();
        });
      })
      .then(function (cleared2) {
        if (total < 1) return cleared2;
        return addVariantToCartByAjax(String(vid), total).then(function () {
          return fetchCartJsSilent();
        });
      })
      .then(function (finalCart) {
        var still = collectCartLinesForVariant(finalCart, vid);
        if (still.length <= 1) {
          var have = 0;
          for (var s = 0; s < still.length; s++) have += still[s].qty;
          if (have === total || total < 1) return finalCart;
          if (still[0] && still[0].key) {
            return bogoCartChangeByKey(still[0].key, total).then(function () {
              return fetchCartJsSilent();
            });
          }
        }
        /* Theme re-split on add — zero extras by key, keep first at total. */
        if (still.length > 1 && still[0].key) {
          var upd = {};
          upd[still[0].key] = total;
          for (var u = 1; u < still.length; u++) {
            if (still[u].key) upd[still[u].key] = 0;
          }
          return bogoCartUpdateLines(upd).then(function () {
            return fetchCartJsSilent();
          });
        }
        return finalCart;
      });
  }

  /**
   * Merge every duplicate variant into one line (Boga 5+5 → Boga 10).
   * Silent by default — caller refreshes theme UI after sync so the drawer
   * never paints a half-merged cart.
   */
  function mergeAllDuplicateVariantLines(cart, opts) {
    var refreshUi = opts && opts.refreshUi === true;
    if (!cart || !Array.isArray(cart.items) || !cart.items.length) {
      return Promise.resolve(cart);
    }
    if (!cartHasDuplicateVariants(cart)) {
      return Promise.resolve(cart);
    }

    function pass(current, attempt) {
      if (!current || attempt > 6) return Promise.resolve(current);
      if (!cartHasDuplicateVariants(current)) return Promise.resolve(current);

      var groups = groupCartLinesByVariant(current);
      var vids = Object.keys(groups);
      var dupVid = "";
      for (var i = 0; i < vids.length; i++) {
        if (groups[vids[i]].length > 1) {
          dupVid = vids[i];
          break;
        }
      }
      if (!dupVid) return Promise.resolve(current);

      var step =
        attempt >= 1
          ? forceReaddVariantAsSingleLine(current, dupVid)
          : mergeOneVariantLines(current, dupVid);

      return step.then(function (next) {
        return fetchCartJsSilent().then(function (fresh) {
          var cartNow = fresh || next || current;
          if (cartHasDuplicateVariants(cartNow)) {
            return pass(cartNow, attempt + 1);
          }
          return cartNow;
        });
      });
    }

    /* Fast path: single update.js with all key→qty maps. */
    var updates = buildBogoMergeUpdates(cart);
    var start = Promise.resolve(cart);
    if (Object.keys(updates).length) {
      start = bogoCartUpdateLines(updates).then(function (updated) {
        return fetchCartJsSilent().then(function (fresh) {
          return fresh || updated || cart;
        });
      });
    }

    return start
      .then(function (afterFast) {
        return pass(afterFast || cart, 0);
      })
      .then(function (finalCart) {
        if (!refreshUi) return finalCart;
        return fetchCartAndRefresh().then(function () {
          return finalCart;
        });
      });
  }

  /**
   * BOGO Buy add: bump one existing line by key, else plain cart/add.js.
   * Never force-readd / wipe (that split Boga lines on Valor).
   */
  function addBogoVariantToCart(variantId, quantity) {
    var id = parseInt(String(variantId), 10);
    var qty = parseInt(String(quantity), 10) || 1;
    if (!Number.isFinite(id) || id < 1) {
      return Promise.reject(new Error("Invalid variant"));
    }
    qty = Math.min(VD_MAX_LINE_QTY, Math.max(1, qty));
    return fetchCartJsSilent().then(function (cart) {
      var lines = collectCartLinesForVariant(cart, String(id));
      if (!lines.length) {
        return addBogoPlainCartAdd(String(id), qty);
      }
      var have = 0;
      for (var i = 0; i < lines.length; i++) have += lines[i].qty;
      var total = Math.min(VD_MAX_LINE_QTY, have + qty);
      if (lines.length === 1 && lines[0].key) {
        return bogoCartChangeByKey(lines[0].key, total);
      }
      /* Already split — append only; do not wipe/merge Buy lines. */
      return addBogoPlainCartAdd(String(id), qty);
    });
  }

  function sectionsUrlPath() {
    var p = String(window.location.pathname || "/");
    if (p.charAt(0) !== "/") p = "/" + p;
    return p;
  }

  /**
   * Theme Liquid section IDs for bundled Cart API rendering (max 5).
   * Dawn: cart-drawer.getSectionsToRender(); Valor: data-section-id / shopify-section-*.
   */
  function getCartSectionsToRequest() {
    var ids = [];
    var seen = {};
    function add(id) {
      var s = String(id || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      ids.push(s);
    }
    try {
      var fromNs = offrefyNs().cartSectionIds;
      if (Array.isArray(fromNs)) {
        for (var i = 0; i < fromNs.length; i++) add(fromNs[i]);
      }
    } catch (eNs) {
      void eNs;
    }
    try {
      var dawn = document.querySelector("cart-drawer");
      if (dawn && typeof dawn.getSectionsToRender === "function") {
        var list = dawn.getSectionsToRender() || [];
        for (var d = 0; d < list.length; d++) {
          add(list[d] && (list[d].id || list[d].section));
        }
      }
    } catch (eDawn) {
      void eDawn;
    }
    var collected = collectCartDrawerSectionIds();
    for (var c = 0; c < collected.length; c++) add(collected[c]);
    add(resolveCartDrawerSectionId(findCartDrawerHost()));
    add("cart-icon-bubble");
    add("cart-drawer");
    return ids.slice(0, 5);
  }

  /**
   * Apply Liquid HTML returned by Cart API bundled `sections` (official theme pattern).
   */
  function applyBundledCartSections(payload) {
    if (!payload || !payload.sections || typeof payload.sections !== "object") {
      return false;
    }
    var applied = false;
    try {
      var dawn = document.querySelector("cart-drawer");
      if (dawn && typeof dawn.renderContents === "function") {
        dawn.classList.remove("is-empty");
        dawn.renderContents(payload);
        openCartDrawerHost(dawn);
        applied = true;
      }
    } catch (eDawn) {
      void eDawn;
    }

    var sections = payload.sections;
    var keys = Object.keys(sections);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var html = sections[id];
      if (!html || html === "null") continue;
      try {
        var el =
          document.getElementById("shopify-section-" + id) ||
          document.querySelector('[id="shopify-section-' + id + '"]') ||
          document.querySelector('[data-section-id="' + id + '"]');
        if (el) {
          var tmp = document.createElement("div");
          tmp.innerHTML = html;
          var next = tmp.firstElementChild;
          if (next) {
            el.innerHTML = next.innerHTML;
            if (next.className) el.className = next.className;
          } else {
            el.innerHTML = html;
          }
          applied = true;
          continue;
        }
        /* Valor drawer host may not use shopify-section-* id — paint into host. */
        if (
          /cart-drawer|cart_drawer|CartDrawer/i.test(id) ||
          i === 0
        ) {
          if (applyCartDrawerSectionHtml(html, payload)) applied = true;
        }
      } catch (eSec) {
        void eSec;
      }
    }

    try {
      var valor = document.querySelector("valor-cart-drawer");
      if (valor) {
        valor.classList.remove("is-empty");
        openCartDrawerHost(valor);
        if (typeof valor.updateCartCount === "function" && payload.item_count != null) {
          valor.updateCartCount({ item_count: payload.item_count | 0 });
        }
      }
    } catch (eV) {
      void eV;
    }

    updateCartCountBubbles(payload);
    scheduleCartDrawerDiscountLabelPatch();
    return applied;
  }

  /**
   * BOGO cart/add.js — items only, never request Liquid cart-drawer/page sections.
   * Theme owns drawer/page HTML; BOGO must not refresh or open them.
   */
  function addBogoItemsWithSections(items, withSections) {
    void withSections;
    var list = Array.isArray(items) ? items : [];
    var cleaned = [];
    for (var i = 0; i < list.length; i++) {
      var id = parseInt(String(list[i] && list[i].id), 10);
      var qty = parseInt(String(list[i] && list[i].quantity), 10) || 1;
      if (!Number.isFinite(id) || id < 1) continue;
      cleaned.push({
        id: id,
        quantity: Math.min(VD_MAX_LINE_QTY, Math.max(1, qty)),
      });
    }
    if (!cleaned.length) return Promise.resolve(null);

    return fetch(shopifyRoutesRoot() + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ items: cleaned }),
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
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        });
    });
  }

  /** cart/add.js with id+qty only (no Offrefy properties) so BXGY can mark free. */
  function addBogoPlainCartAdd(variantId, quantity, opts) {
    void opts;
    return addBogoItemsWithSections(
      [{ id: variantId, quantity: quantity }],
      false,
    );
  }

  /** Parse variant id + qty from /cart/add.js request body. */
  function parseCartAddBody(init) {
    try {
      if (!init || init.body == null) return null;
      if (typeof init.body === "string") {
        var parsed = JSON.parse(init.body);
        var id = parsed && (parsed.id || parsed.variant_id);
        var qty = parsed && parsed.quantity;
        if (id != null) {
          return {
            id: String(id),
            qty: Math.max(1, Number(qty) || 1),
          };
        }
      }
      if (typeof FormData !== "undefined" && init.body instanceof FormData) {
        var fid = init.body.get("id") || init.body.get("variant_id");
        var fqty = init.body.get("quantity");
        if (fid) {
          return {
            id: String(fid),
            qty: Math.max(1, Number(fqty) || 1),
          };
        }
      }
    } catch (e) {
      void e;
    }
    return null;
  }

  /**
   * Buy product IDs for BXGY qualification. Never fall back to campaign.productIds
   * when that list also contains Get products (would count Coca-Cola toward Buy 5).
   * Always strip Get product IDs for cross-product deals.
   */
  function bogoBuyProductIdsForCart(campaign) {
    var bogo = campaign && campaign.bogo;
    if (!bogo) return [];
    var buyIds = (bogo.buysProductIds || []).length
      ? bogo.buysProductIds.slice()
      : [];
    if (!buyIds.length) {
      /* Only use campaign.productIds when Get pool is identical / empty. */
      var all = campaign.productIds || [];
      if (bogoIsIdenticalBuyGetProducts(bogo) || !(bogo.getsProductIds || []).length) {
        buyIds = all.slice();
      } else {
        buyIds = all.filter(function (id) {
          return !bogoProductIdInList(
            bogoIdNumericTail(id) || id,
            bogo.getsProductIds || [],
          );
        });
      }
    }
    if (bogoIsIdenticalBuyGetProducts(bogo)) return buyIds;

    var getIds = (bogo.getsProductIds || []).slice();
    var lines = bogo.getsLines || [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] && lines[i].productId) getIds.push(lines[i].productId);
    }
    if (!getIds.length) return buyIds;
    return buyIds.filter(function (id) {
      return !bogoProductIdInList(bogoIdNumericTail(id) || id, getIds);
    });
  }

  function bogoResolveBuysQuantity(bogo, campaign) {
    var fromBogo = Number(bogo && bogo.buysQuantity);
    if (Number.isFinite(fromBogo) && fromBogo >= 1) return Math.floor(fromBogo);
    var tier0 =
      campaign &&
      Array.isArray(campaign.tiers) &&
      campaign.tiers[0] &&
      Number(campaign.tiers[0].minQty);
    if (Number.isFinite(tier0) && tier0 >= 1) return Math.floor(tier0);
    return 1;
  }

  /**
   * CTA-only: add missing Get units via cart/add.js.
   * Never cart/change or cart/update — those extend drawer qty loading spinners.
   * Do not strip/trim Get lines here; native Shopify BXGY owns pricing.
   */
  function reconcileBogoGetVariantQty(cart, variantId, needGet) {
    var vid = String(variantId || "");
    var need = Math.max(0, Math.min(VD_MAX_LINE_QTY, Number(needGet) || 0));
    if (!vid || need <= 0) return Promise.resolve(cart);
    var lines = collectCartLinesForVariant(cart, vid);
    var have = 0;
    for (var i = 0; i < lines.length; i++) have += lines[i].qty;
    if (have >= need) return Promise.resolve(cart);
    return addBogoPlainCartAdd(vid, need - have, { sections: false }).then(
      function () {
        return cart;
      },
    );
  }

  /**
   * Resolve which Get line the shopper selected in the BOGO widget.
   * Falls back to getsLines[0] (legacy behavior) when no selection exists.
   */
  function resolveBogoSelectedGetLine(campaign) {
    var bogo = campaign && campaign.bogo;
    var lines = bogo && Array.isArray(bogo.getsLines) ? bogo.getsLines : [];
    if (!lines.length) return null;
    var idx = 0;
    try {
      var roots = document.querySelectorAll('[data-offrefy-inited="1"]');
      var campId = campaign && campaign.id != null ? String(campaign.id) : "";
      for (var i = 0; i < roots.length; i++) {
        var r = roots[i];
        var rc = r && r._offrefyBogoCampaign;
        if (!rc) continue;
        if (campId && String(rc.id) !== campId) continue;
        var s = Number(r._offrefyBogoSelectedGetIndex);
        if (Number.isFinite(s) && s >= 0 && s < lines.length) {
          idx = Math.floor(s);
          break;
        }
      }
    } catch (eSel) {
      void eSel;
    }
    return lines[idx] || lines[0];
  }

  /** Never strip Get lines from drawer/qty flows — no cart/update. */
  function stripOtherBogoGetFreeLines(cart) {
    return Promise.resolve(cart || null);
  }

  /**
   * Shopify POST /cart/add.js accepts one variant (`id`) or many (`items`).
   * Quantity-break ATC submits the theme product form, and the theme renders
   * the drawer from that response. When a BOGO gift is armed, fold it into
   * that same request so the theme still owns the drawer and both lines land
   * together. https://shopify.dev/docs/api/ajax/reference/cart
   */
  function bogoCartAddWithGift(parsed, pending) {
    if (!parsed || typeof parsed !== "object" || !pending) return null;
    var giftId = parseInt(String(pending.id), 10);
    var giftQty = Math.min(
      VD_MAX_LINE_QTY,
      Math.max(1, parseInt(String(pending.qty), 10) || 1),
    );
    if (!Number.isFinite(giftId) || giftId < 1) return null;

    var items = [];
    if (Array.isArray(parsed.items) && parsed.items.length) {
      for (var i = 0; i < parsed.items.length; i++) items.push(parsed.items[i]);
    } else if (parsed.id != null) {
      var line = {
        id: parseInt(String(parsed.id), 10),
        quantity: parseInt(String(parsed.quantity), 10) || 1,
      };
      if (parsed.properties) line.properties = parsed.properties;
      if (parsed.selling_plan) line.selling_plan = parsed.selling_plan;
      items.push(line);
    } else {
      return null;
    }
    var already = false;
    for (var j = 0; j < items.length; j++) {
      if (parseInt(String(items[j] && items[j].id), 10) === giftId) already = true;
    }
    if (!already) items.push({ id: giftId, quantity: giftQty });

    var next = { items: items };
    var keys = Object.keys(parsed);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (
        key === "id" ||
        key === "quantity" ||
        key === "items" ||
        key === "properties" ||
        key === "selling_plan"
      ) {
        continue;
      }
      next[key] = parsed[key];
    }
    return next;
  }

  function bogoFormDataToCartAdd(fd) {
    var parsed = {
      id: fd.get("id") || fd.get("variant_id"),
      quantity: fd.get("quantity") || 1,
    };
    if (parsed.id == null || parsed.id === "") return null;
    var sections = fd.getAll ? fd.getAll("sections") : [];
    if (sections && sections.length === 1) parsed.sections = String(sections[0]);
    else if (sections && sections.length > 1) {
      parsed.sections = sections.map(function (s) {
        return String(s);
      });
    }
    var sectionsUrl = fd.get("sections_url");
    if (sectionsUrl) parsed.sections_url = String(sectionsUrl);
    var selling = fd.get("selling_plan");
    if (selling) parsed.selling_plan = String(selling);
    var props = {};
    var propCount = 0;
    if (typeof fd.forEach === "function") {
      fd.forEach(function (value, key) {
        var m = String(key).match(/^properties\[(.+)\]$/);
        if (!m) return;
        props[m[1]] = String(value);
        propCount += 1;
      });
    }
    if (propCount) parsed.properties = props;
    return parsed;
  }

  function rewriteBogoCartAddBody(body, pending) {
    if (body == null || !pending) return null;
    try {
      if (typeof body === "string") {
        var parsed = JSON.parse(body);
        var next = bogoCartAddWithGift(parsed, pending);
        return next ? JSON.stringify(next) : null;
      }
      if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
        var fromParams = bogoFormDataToCartAdd(body);
        var nextParams = fromParams ? bogoCartAddWithGift(fromParams, pending) : null;
        return nextParams ? JSON.stringify(nextParams) : null;
      }
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        var fromForm = bogoFormDataToCartAdd(body);
        var nextForm = fromForm ? bogoCartAddWithGift(fromForm, pending) : null;
        return nextForm ? JSON.stringify(nextForm) : null;
      }
    } catch (eBody) {
      void eBody;
    }
    return null;
  }

  function rewriteBogoCartAddInit(init, pending) {
    if (!init || init.body == null) return null;
    var body = rewriteBogoCartAddBody(init.body, pending);
    if (!body) return null;
    var headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json");
    if (!headers.get("Accept")) headers.set("Accept", "application/json");
    var next = {};
    var initKeys = Object.keys(init);
    for (var i = 0; i < initKeys.length; i++) next[initKeys[i]] = init[initKeys[i]];
    next.body = body;
    next.headers = headers;
    return next;
  }

  function installBogoGiftOnCartAdd() {
    var ns = offrefyNs();
    if (ns._offrefyBogoGiftHook) return;
    ns._offrefyBogoGiftHook = true;

    if (typeof window.fetch === "function") {
      var origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var pending = ns._offrefyBogoPendingGift;
        var url = "";
        try {
          if (typeof input === "string") url = input;
          else if (input && typeof input.url === "string") url = input.url;
        } catch (eUrl) {
          void eUrl;
        }
        if (!pending || String(url).indexOf("/cart/add") === -1) {
          return origFetch.apply(window, arguments);
        }
        try {
          if (init && init.body != null) {
            var rewritten = rewriteBogoCartAddInit(init, pending);
            if (rewritten) {
              ns._offrefyBogoPendingGift = null;
              return origFetch.call(window, input, rewritten);
            }
          }
          if (typeof Request !== "undefined" && input instanceof Request) {
            var req = input;
            return req.clone().text().then(function (text) {
              var parsed = null;
              try {
                parsed = text ? JSON.parse(text) : null;
              } catch (eParse) {
                void eParse;
              }
              var still = ns._offrefyBogoPendingGift || pending;
              var next = parsed ? bogoCartAddWithGift(parsed, still) : null;
              if (!next) return origFetch.call(window, req);
              ns._offrefyBogoPendingGift = null;
              var headers = new Headers(req.headers);
              headers.set("Content-Type", "application/json");
              return origFetch.call(
                window,
                new Request(req, {
                  body: JSON.stringify(next),
                  headers: headers,
                }),
              );
            });
          }
        } catch (eHook) {
          void eHook;
        }
        return origFetch.apply(window, arguments);
      };
    }

    if (typeof XMLHttpRequest === "function") {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          this._offrefyUrl = url;
        } catch (eOpen) {
          void eOpen;
        }
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        try {
          var pendingX = ns._offrefyBogoPendingGift;
          if (
            pendingX &&
            String(this._offrefyUrl || "").indexOf("/cart/add") !== -1
          ) {
            var rewrittenX = rewriteBogoCartAddBody(body, pendingX);
            if (rewrittenX) {
              ns._offrefyBogoPendingGift = null;
              try {
                this.setRequestHeader("Content-Type", "application/json");
              } catch (eHdr) {
                void eHdr;
              }
              return origSend.call(this, rewrittenX);
            }
          }
        } catch (eSend) {
          void eSend;
        }
        return origSend.apply(this, arguments);
      };
    }
  }

  /** No automatic Get add outside the widget button. */
  function ensureBogoGetItemsInCart(campaign) {
    void campaign;
    return Promise.resolve(null);
  }

  /** No cart drawer/page listeners for BOGO — free Get only on widget CTA. */
  function initGlobalBogoGetAssist() {
    return;
  }

  /** Campaign refs on root for CTA gift selection only — no cart interceptors. */
  function bindBogoAtcAssist(root, campaign) {
    if (!root || !campaign) return;
    var productId = root.getAttribute("data-product-id");
    root._offrefyBogoCampaign = campaign;
    root._offrefyBogoDeal = bogoSameProductQuantityDeal(campaign, productId);
  }

  /** Liquid Section Rendering id — Valor hardcodes "cart-drawer". */
  function cartDrawerSectionId() {
    var ns = offrefyNs();
    try {
      var root = document.querySelector("[data-offrefy-cart-drawer-section]");
      var fromRoot =
        root && root.getAttribute("data-offrefy-cart-drawer-section");
      if (fromRoot) return String(fromRoot);
    } catch (eRoot) {
      void eRoot;
    }
    if (ns.cartDrawerSectionId) return String(ns.cartDrawerSectionId);
    if (Array.isArray(ns.cartSectionIds)) {
      for (var i = 0; i < ns.cartSectionIds.length; i++) {
        if (/cart.?drawer/i.test(String(ns.cartSectionIds[i] || ""))) {
          return String(ns.cartSectionIds[i]);
        }
      }
    }
    return "cart-drawer";
  }

  function openValorCartDrawer(valor) {
    var el = valor || document.querySelector("valor-cart-drawer");
    if (!el) return;
    try {
      if (typeof el.open === "function") {
        el.open();
        return;
      }
    } catch (eOpen) {
      void eOpen;
    }
    try {
      el.removeAttribute("hidden");
      el.setAttribute("data-open", "");
      el.classList.remove("valor-cart-drawer--empty");
      document.body.classList.add("valor-cart-drawer-open");
    } catch (eAttr) {
      void eAttr;
    }
  }

  /**
   * Same signal Valor theme ATC fires after /cart/add.js.
   * Drawer applies Liquid sections HTML from the response and opens — no reload.
   */
  function notifyValorCartAdded(payload) {
    try {
      document.dispatchEvent(
        new CustomEvent("valor:cart:added", {
          bubbles: true,
          detail: payload && typeof payload === "object" ? payload : {},
        }),
      );
      return true;
    } catch (e) {
      void e;
      return false;
    }
  }

  /**
   * BOGO no longer opens/refreshes cart drawer or cart page.
   * Theme owns that UI after native ATC; BOGO only mutates cart JSON silently.
   */
  function showCartAfterBogoAdd(payload) {
    return Promise.resolve(payload || null);
  }

  function bogoParseRgb(color) {
    var m = String(color || "").match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i,
    );
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] == null ? 1 : Number(m[4]),
    };
  }

  function bogoLuminance(color) {
    var c = bogoParseRgb(color);
    if (!c || c.a < 0.35) return null;
    function ch(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function bogoOpaqueBackground(start) {
    var node = start;
    var depth = 0;
    while (node && depth < 8) {
      try {
        var bg = window.getComputedStyle(node).backgroundColor;
        var lum = bogoLuminance(bg);
        if (lum != null) return { color: bg, lum: lum, node: node };
      } catch (eBg) {
        void eBg;
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  /**
   * Pull font, button shape, and light/dark surfaces from the live theme
   * so the offer card matches Dawn, Horizon, Impulse, and dark themes.
   * A custom campaign button color still wins over the theme button.
   */
  function applyBogoThemeMatch(root, card) {
    if (!card || !window.getComputedStyle) return;
    try {
      var bodyStyle = window.getComputedStyle(document.body);
      if (bodyStyle && bodyStyle.fontFamily) {
        card.style.setProperty("--ob-font", bodyStyle.fontFamily);
      }

      var sample = bogoOpaqueBackground(root.parentElement || document.body);
      var dark = sample && sample.lum != null && sample.lum < 0.42;
      if (dark) {
        card.setAttribute("data-scheme", "dark");
        card.style.setProperty("--ob-theme-surface", sample.color);
        var fg = window.getComputedStyle(sample.node).color;
        if (bogoLuminance(fg) != null) {
          card.style.setProperty("--ob-theme-ink", fg);
        }
      } else {
        card.setAttribute("data-scheme", "light");
      }

      var form = findThemeProductCartForm();
      var btn = findThemeCartAddSubmitButton(form);
      if (btn) {
        var bs = window.getComputedStyle(btn);
        var radius = parseFloat(bs.borderTopLeftRadius);
        if (Number.isFinite(radius)) {
          var clamped = Math.max(0, Math.min(16, radius));
          card.style.setProperty("--ob-cta-radius", clamped + "px");
        }
        if (bs.fontWeight) card.style.setProperty("--ob-cta-weight", bs.fontWeight);
        if (bs.letterSpacing && bs.letterSpacing !== "normal") {
          card.style.setProperty("--ob-cta-tracking", bs.letterSpacing);
        }
        if (bs.textTransform && bs.textTransform !== "none") {
          card.style.setProperty("--ob-cta-transform", bs.textTransform);
        }
        var merchant = String(
          (root.style && root.style.getPropertyValue("--vd-primary")) || "",
        )
          .trim()
          .toLowerCase()
          .replace(/\s/g, "");
        var isDefaultCta =
          !merchant ||
          merchant === "#111213" ||
          merchant === "#121212" ||
          merchant === "#111111" ||
          merchant === "#111" ||
          merchant === "#000" ||
          merchant === "#000000" ||
          merchant === "rgb(17,18,19)" ||
          merchant === "rgb(18,18,18)" ||
          merchant === "rgb(17,17,17)" ||
          merchant === "rgb(0,0,0)";
        if (isDefaultCta) {
          var buttonLum = bogoLuminance(bs.backgroundColor);
          if (buttonLum != null && buttonLum < 0.94) {
            card.style.setProperty("--ob-cta", bs.backgroundColor);
            if (bogoLuminance(bs.color) != null) {
              card.style.setProperty("--ob-cta-text", bs.color);
            }
          }
        }
      }

      var cta = card.querySelector(".offrefy-bogo__cta");
      if (cta) {
        var ctaBg = window.getComputedStyle(cta).backgroundColor;
        var ctaLum = bogoLuminance(ctaBg);
        var surfaceLum = sample && sample.lum != null ? sample.lum : 1;
        if (
          ctaLum != null &&
          Math.abs(ctaLum - surfaceLum) < 0.18
        ) {
          if (surfaceLum < 0.5) {
            card.style.setProperty("--ob-cta", "#f4f4f5");
            card.style.setProperty("--ob-cta-text", "#111111");
          } else {
            card.style.setProperty("--ob-cta", "#111111");
            card.style.setProperty("--ob-cta-text", "#ffffff");
          }
        } else if (
          ctaLum != null &&
          !card.style.getPropertyValue("--ob-cta-text")
        ) {
          card.style.setProperty(
            "--ob-cta-text",
            ctaLum > 0.62 ? "#111111" : "#ffffff",
          );
        }
      }
    } catch (eTheme) {
      void eTheme;
    }
  }

  /**
   * Paint the BOGO card in a shadow root with the same stylesheet as the
   * isolated HTML preview, so theme button/image rules cannot restyle it.
   */
  function openBogoScope(mountEl, cardHtml) {
    var pageCss = document.querySelector(
      'link[href*="volume-discount-storefront.css"]',
    );
    var wrapped =
      '<div data-offrefy-root class="offrefy-bogo-host">' + cardHtml + "</div>";
    if (!pageCss || !mountEl.attachShadow) {
      mountEl.innerHTML = wrapped;
      return mountEl;
    }
    var host = document.createElement("div");
    host.setAttribute("data-offrefy-bogo-shadow", "1");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("width", "100%", "important");
    host.style.setProperty("max-width", "100%", "important");
    host.style.setProperty("min-width", "0", "important");
    host.style.setProperty("margin", "0", "important");
    host.style.setProperty("padding", "0", "important");
    host.style.setProperty("border", "0", "important");
    host.style.setProperty("background", "transparent", "important");
    host.style.setProperty("box-shadow", "none", "important");
    mountEl.textContent = "";
    mountEl.appendChild(host);
    var shadow = host.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = pageCss.href;
    shadow.appendChild(link);
    var scope = document.createElement("div");
    scope.setAttribute("data-offrefy-bogo-root", "1");
    scope.innerHTML = wrapped;
    shadow.appendChild(scope);
    return scope;
  }

  function mountBogoBundle(root, mountEl, campaign) {
    clearCountdown(root);
    var bogo = campaign.bogo || {};
    var wd =
      campaign.widgetDisplay && typeof campaign.widgetDisplay === "object"
        ? campaign.widgetDisplay
        : {};
    var locale = resolveStorefrontLocale(root);
    var sparseMap =
      campaign.displayNameTranslations &&
      typeof campaign.displayNameTranslations === "object"
        ? campaign.displayNameTranslations
        : {};
    var sparseLang =
      sparseMap[locale] ||
      sparseMap[String(locale || "").split("-")[0]] ||
      {};
    var transMap = resolveWidgetTranslations(root, campaign);
    var langTrans = resolveLangTranslation(locale, transMap, root);
    var sparseHeading = String(sparseLang.transHeading || "").trim();
    var sparseCta = String(sparseLang.transCta || "").trim();
    var sparseFootnote = String(sparseLang.transFootnote || "").trim();
    var title = String(
      sparseHeading ||
        wd.widgetHeading ||
        (!String(wd.widgetHeading || "").trim() && langTrans.transHeading
          ? langTrans.transHeading
          : "") ||
        campaign.displayName ||
        campaign.campaignName ||
        "Buy X, Get Y",
    ).trim();
    var buysQty = Math.max(1, Number(bogo.buysQuantity) || 1);
    var getsQty = Math.max(1, Number(bogo.getsQuantity) || 1);
    var productId = root.getAttribute("data-product-id");
    var sameDeal = bogoSameProductQuantityDeal(campaign, productId);
    var buyLine =
      bogo.buysRequirement === "amount"
        ? "Spend $" + String(bogo.buysAmount || "0")
        : "Buy " + buysQty;
    var getLine =
      bogo.getsValueType === "percentage"
        ? "Get " + getsQty + " at " + String(bogo.getsValue || "0") + "% off"
        : bogo.getsValueType === "amount"
          ? "Get " + getsQty + " with $" + String(bogo.getsValue || "0") + " off each"
          : "Get " + getsQty + " free";
    var uses =
      bogo.usesPerOrderLimit != null && Number(bogo.usesPerOrderLimit) > 0
        ? "Max " + String(bogo.usesPerOrderLimit) + " use(s) per order"
        : "";
    var getTitleHint =
      bogo.getsLines && bogo.getsLines[0] && bogo.getsLines[0].title
        ? String(bogo.getsLines[0].title)
        : "";
    var noteDefault = sameDeal
      ? "Add " +
        sameDeal.needQty +
        " to your cart to unlock this offer. Discount applies automatically."
      : getTitleHint
        ? "Buy " +
          buysQty +
          " qualifying item(s) — tap the button to add “" +
          getTitleHint +
          "” free. If you add more Buy qty in the cart, tap the button again to unlock more free items."
        : "Buy " +
          buysQty +
          " qualifying item(s). Tap the button to add free Get items (tap again after adding more Buy qty).";
    var note =
      sparseFootnote ||
      String(wd.footnote || "").trim() ||
      (langTrans.transFootnote && String(langTrans.transFootnote).trim()) ||
      noteDefault;

    var onBuyProduct =
      bogoProductIdInList(productId, bogo.buysProductIds || []) ||
      (sameDeal ? true : false) ||
      (!(bogo.buysProductIds || []).length &&
        bogoProductIdInList(productId, campaign.productIds || []));
    var showCta = Boolean(sameDeal || onBuyProduct);
    var ctaFromWd = String(
      sparseCta ||
        wd.ctaLabel ||
        (!String(wd.ctaLabel || "").trim() && langTrans.transCta
          ? langTrans.transCta
          : "") ||
        "",
    ).trim();
    var ctaLabel = ctaFromWd
      ? ctaFromWd
      : sameDeal
        ? "Add " + sameDeal.needQty + " to cart"
        : "Add " + buysQty + " + unlock offer";

    try {
      if (wd.primaryColor) root.style.setProperty("--vd-primary", String(wd.primaryColor));
      if (wd.primaryHoverColor) {
        root.style.setProperty("--vd-primary-hover", String(wd.primaryHoverColor));
      }
      if (wd.selectedBgColor) {
        root.style.setProperty("--vd-selected-bg", String(wd.selectedBgColor));
      }
      if (wd.cardBorderColor) {
        root.style.setProperty("--vd-card-border", String(wd.cardBorderColor));
      }
    } catch (eWd) {
      void eWd;
    }
    var liquidFormId = root.getAttribute("data-offrefy-product-form-id") || "";
    var targetBuyQty = sameDeal
      ? sameDeal.needQty
      : Math.max(1, Number(bogo.buysQuantity) || 1);

    var pageTitle =
      String(root.getAttribute("data-product-title") || "").trim() ||
      "Product";
    var pageImage = String(root.getAttribute("data-product-image") || "").trim();
    if (!pageImage) {
      try {
        var og = document.querySelector('meta[property="og:image"]');
        if (og && og.getAttribute("content")) {
          pageImage = String(og.getAttribute("content")).trim();
        }
      } catch (eOg) {
        void eOg;
      }
    }
    var pageCents = Number(root.getAttribute("data-unit-price-cents")) || 0;
    var currency = String(root.getAttribute("data-currency") || "USD");
    var buysLines = Array.isArray(bogo.buysLines) ? bogo.buysLines : [];
    var getsLines = Array.isArray(bogo.getsLines) ? bogo.getsLines : [];
    var buyLineMatch = null;
    for (var bli = 0; bli < buysLines.length; bli++) {
      if (
        buysLines[bli] &&
        bogoProductIdInList(productId, [buysLines[bli].productId])
      ) {
        buyLineMatch = buysLines[bli];
        break;
      }
    }
    var buysLine0 = buyLineMatch || buysLines[0] || null;
    var getsLine0 = getsLines[0] || null;
    /*
     * On a Buy product page, always show THIS product as Buy (not buysLines[0]).
     * Matches merchant expectation: Buy 5 of qualifying items from the pool.
     */
    var buyTitle = String(
      (onBuyProduct ? pageTitle : null) ||
        (buysLine0 && buysLine0.title) ||
        pageTitle ||
        "Product",
    ).trim();
    var buyImage = String(
      (onBuyProduct ? pageImage : null) ||
        (buysLine0 && buysLine0.imageUrl) ||
        pageImage ||
        "",
    ).trim();
    var buyCents =
      onBuyProduct && pageCents > 0
        ? pageCents
        : buysLine0 && Number(buysLine0.priceCents) > 0
          ? Number(buysLine0.priceCents)
          : pageCents;
    var buyPrice = buyCents > 0 ? fmtMoney(buyCents, currency) : "";
    var getPoolCount = getsLines.length;
    var bogoCopy =
      wd.bogoCopy && typeof wd.bogoCopy === "object" ? wd.bogoCopy : {};
    function bogoLabel(transKey, copyKey, fallback) {
      var fromLang = String(sparseLang[transKey] || "").trim();
      if (fromLang) return fromLang;
      var fromCopy = String(bogoCopy[copyKey] || "").trim();
      return fromCopy || fallback;
    }
    function fillBogoTpl(template, vars) {
      var out = String(template || "");
      var key;
      for (key in vars) {
        if (!Object.prototype.hasOwnProperty.call(vars, key)) continue;
        var val = String(vars[key]);
        out = out.split("{{" + key + "}}").join(val).split("{" + key + "}").join(val);
      }
      return out;
    }
    var labelBadge = bogoLabel("transBogoBadge", "badgeLabel", "Special Offer");
    var labelBuy = bogoLabel("transBogoBuy", "buyLabel", "BUY");
    var labelGetFree = bogoLabel("transBogoGetFree", "getFreeLabel", "GET FREE");
    var labelGet = bogoLabel("transBogoGet", "getLabel", "GET");
    var labelFree = bogoLabel("transBogoFree", "freeLabel", "FREE");
    var pickTpl =
      getsQty === 1
        ? bogoLabel("transBogoPick", "pickLabel", "Pick {{qty}} free gift")
        : bogoLabel(
            "transBogoPickPlural",
            "pickLabelPlural",
            "Pick {{qty}} free gifts",
          );
    var availableTpl = bogoLabel(
      "transBogoAvailable",
      "availableLabel",
      "{{count}} products available",
    );
    var getTitle = String(
      getPoolCount > 1
        ? fillBogoTpl(pickTpl, { qty: getsQty })
        : (getsLine0 && getsLine0.title) ||
            getTitleHint ||
            (sameDeal ? buyTitle : "Get item"),
    ).trim();
    var getHint =
      getPoolCount > 1
        ? fillBogoTpl(availableTpl, { count: getPoolCount })
        : "";
    var getImages = [];
    if (getPoolCount > 1) {
      for (var gi = 0; gi < getsLines.length && getImages.length < 3; gi++) {
        var gImg = String((getsLines[gi] && getsLines[gi].imageUrl) || "").trim();
        if (gImg) getImages.push(gImg);
      }
    }
    var getImage = String(
      (getsLine0 && getsLine0.imageUrl) ||
        (sameDeal ? buyImage : "") ||
        "",
    ).trim();
    if (!getImages.length && getImage) getImages = [getImage];
    if (!getImages.length && sameDeal && buyImage) getImages = [buyImage];
    var getCents =
      getsLine0 && Number(getsLine0.priceCents) > 0
        ? Number(getsLine0.priceCents)
        : sameDeal
          ? buyCents
          : 0;
    /* Never fall back Get → Buy price (causes refresh flash when remote price arrives). */
    var getPrice =
      getPoolCount > 1
        ? ""
        : getCents > 0
          ? fmtMoney(getCents, currency)
          : "";
    var isFreeGet =
      bogo.getsValueType !== "percentage" && bogo.getsValueType !== "amount";
    var heroTitle =
      String(wd.widgetHeading || "").trim() ||
      (bogo.buysRequirement === "amount"
        ? title
        : "Buy " + buysQty + " Get " + getsQty + (isFreeGet ? " Free" : ""));
    var stockFoot =
      "Discount applies automatically when Buy and Get quantities are in your cart.";
    var footRaw = String(wd.footnote || "").trim();
    var heroSub =
      (footRaw && footRaw !== stockFoot ? footRaw : "") ||
      (bogo.buysRequirement === "amount"
        ? note
        : "Buy " +
          buyTitle +
          (isFreeGet
            ? getPoolCount > 1
              ? " and get a free gift of your choice."
              : " and get " + getsQty + " free."
            : " and unlock this offer."));

    var svgCart =
      '<svg class="offrefy-bogo__ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="m1 1c-.55228475 0-1 .44771525-1 1s.44771525 1 1 1h1.7792969a.69367162.69367162 35.784145 0 1 .65808707.47435058l3.2969911 9.8928369c.14641172.43923517.16502704.91215746.05273437 1.3613281l-.27148437 1.0878906c-.39834445 1.5933778.84195876 3.1835938 2.484375 3.1835938h12c.55228475 0 1-.44771525 1-1s-.44771525-1-1-1h-12c-.38938619 0-.6393619-.31950554-.54492188-.69726562l.20473297-.81770594a.64062109.64062109 142.02823 0 1 .6214389-.48502844h10.71875c.43057012.00022511.81295428-.27515444.94921875-.68359375l2.6660156-8c.21596464-.64778704-.26638007-1.3167178-.94921876-1.3164062h-16.111328a.69371294.69371294 35.782526 0 1 -.65811388-.47434165l-.94735487-2.8420646c-.13626447-.40843931-.51864863-.68381886-.94921875-.68359375zm7 19c-1.1045695 0-2 .8954305-2 2s.8954305 2 2 2 2-.8954305 2-2-.8954305-2-2-2zm12 0c-1.1045695 0-2 .8954305-2 2s.8954305 2 2 2 2-.8954305 2-2-.8954305-2-2-2z"/></svg>';
    var svgGift =
      '<svg class="offrefy-bogo__ico" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M32 271.692v192c0 17.664 14.368 32 32 32h160v-224H32z"/><path fill="currentColor" d="M480 143.692H378.752c7.264-4.96 13.504-9.888 17.856-14.304 25.824-25.952 25.824-68.192 0-94.144-25.088-25.28-68.8-25.216-93.856 0-13.888 13.92-50.688 70.592-45.6 108.448h-2.304c5.056-37.856-31.744-94.528-45.6-108.448-25.088-25.216-68.8-25.216-93.856 0C89.6 61.196 89.6 103.436 115.36 129.388c4.384 4.416 10.624 9.344 17.888 14.304H32c-17.632 0-32 14.368-32 32v48c0 8.832 7.168 16 16 16h208v-64h64v64h208c8.832 0 16-7.168 16-16v-48c0-17.632-14.336-32-32-32zM222.112 142.636s-1.344 1.056-5.92 1.056c-22.112 0-64.32-22.976-78.112-36.864-13.408-13.504-13.408-35.52 0-49.024 6.496-6.528 15.104-10.112 24.256-10.112 9.12 0 17.728 3.584 24.224 10.112 21.568 21.696 43.008 77.12 35.552 84.832zM295.776 143.692c-4.544 0-5.888-1.024-5.888-1.056-7.456-7.712 13.984-63.136 35.552-84.832 12.896-13.024 35.456-13.088 48.48 0 13.44 13.504 13.44 35.52 0 49.024-13.792 13.888-56 36.864-78.144 36.864z"/><path fill="currentColor" d="M288 271.692v224h160c17.664 0 32-14.336 32-32v-192H288z"/></svg>';
    var svgEquals =
      '<svg class="offrefy-bogo__op-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M11 4.5h2a.5.5 0 0 1 .5.5v5.5H19a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-5.5V19a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-5.5H5a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h5.5V5a.5.5 0 0 1 .5-.5z"/></svg>';
    var svgCheck =
      '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M7.5 12L10.5 15L16.5 9M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function bogoImgHtml(src, name, extraClass) {
      if (src) {
        return (
          '<img class="offrefy-bogo__img' +
          (extraClass ? " " + extraClass : "") +
          '" src="' +
          esc(src) +
          '" alt="' +
          esc(name || "") +
          '" loading="lazy" width="160" height="160" />'
        );
      }
      return (
        '<div class="offrefy-bogo__img offrefy-bogo__img--ph' +
        (extraClass ? " " + extraClass : "") +
        '" aria-hidden="true"></div>'
      );
    }

    function bogoGiftPickerHtml() {
      var firstLine = getsLines[0] || {};
      var firstSrc =
        String(firstLine.imageUrl || "").trim() || getImage || buyImage;
      var firstName = String(firstLine.title || getTitle || "Gift").trim();
      if (getPoolCount < 2) {
        return (
          '<div class="offrefy-bogo__media">' +
          bogoImgHtml(firstSrc, firstName) +
          "</div>"
        );
      }
      var cards = "";
      var cols = Math.min(2, getsLines.length);
      for (var gi = 0; gi < getsLines.length; gi++) {
        var gl = getsLines[gi] || {};
        var gSrc = String(gl.imageUrl || "").trim();
        var gName = String(gl.title || "Gift " + (gi + 1)).trim();
        cards +=
          '<button type="button" class="offrefy-bogo__choice' +
          (gi === 0 ? " is-selected" : "") +
          '" data-offrefy-bogo-gift-idx="' +
          String(gi) +
          '" aria-pressed="' +
          (gi === 0 ? "true" : "false") +
          '" aria-label="' +
          esc(gName) +
          '">' +
          '<span class="offrefy-bogo__choice-card">' +
          '<span class="offrefy-bogo__check" aria-hidden="true">' +
          svgCheck +
          "</span>" +
          bogoImgHtml(gSrc, gName, "offrefy-bogo__img--choice") +
          '<span class="offrefy-bogo__choice-name">' +
          esc(gName) +
          "</span></span></button>";
      }
      var choicesHtml =
        '<div class="offrefy-bogo__choices" style="--ob-choices:' +
        String(cols) +
        '" role="listbox" aria-label="Choose free gift">' +
        cards +
        "</div>";
      var viewportHtml =
        getPoolCount > 2
          ? '<div class="offrefy-bogo__viewport" data-offrefy-bogo-embla>' +
            choicesHtml +
            "</div>"
          : choicesHtml;
      return '<div class="offrefy-bogo__slider">' + viewportHtml + "</div>";
    }

    function bogoPickerNavHtml() {
      if (getPoolCount < 3) return "";
      return (
        '<div class="offrefy-bogo__navs">' +
        '<button type="button" class="offrefy-bogo__picker-nav" data-offrefy-bogo-gift-prev aria-label="Previous gifts">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M12.7 15.3 7.4 10l5.3-5.3 1.1 1.1L9.6 10l4.2 4.2z"/></svg></button>' +
        '<button type="button" class="offrefy-bogo__picker-nav" data-offrefy-bogo-gift-next aria-label="Next gifts">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M7.3 4.7 12.6 10l-5.3 5.3-1.1-1.1L10.4 10 6.2 5.8z"/></svg></button>' +
        "</div>"
      );
    }

    function bogoBuyTileHtml() {
      var qtyBadge =
        buysQty > 1
          ? '<span class="offrefy-bogo__qty">' + esc("×" + buysQty) + "</span>"
          : "";
      return (
        '<div class="offrefy-bogo__tile offrefy-bogo__tile--buy">' +
        '<div class="offrefy-bogo__head">' +
        '<div class="offrefy-bogo__ribbon offrefy-bogo__ribbon--buy">' +
        svgCart +
        "<span>" +
        esc(labelBuy) +
        "</span></div></div>" +
        '<div class="offrefy-bogo__media">' +
        bogoImgHtml(buyImage, buyTitle) +
        "</div>" +
        '<div class="offrefy-bogo__name">' +
        esc(buyTitle || "Product") +
        "</div>" +
        '<div class="offrefy-bogo__buy-meta">' +
        (buyPrice
          ? '<div class="offrefy-bogo__price offrefy-bogo__price--buy">' +
            esc(buyPrice) +
            "</div>"
          : "") +
        qtyBadge +
        "</div></div>"
      );
    }

    function bogoGetTileHtml() {
      var ribbonLabel = isFreeGet ? labelGetFree : labelGet;
      var priceHtml = isFreeGet
        ? '<div class="offrefy-bogo__price offrefy-bogo__price--free">' +
          (getPoolCount < 2 && getPrice
            ? '<span class="offrefy-bogo__price-was">' +
              esc(getPrice) +
              "</span>"
            : "") +
          '<span class="offrefy-bogo__price-now">' +
          (getPoolCount < 2 && getPrice
            ? esc(fmtMoney(0, currency))
            : esc(labelFree)) +
          "</span></div>"
        : getPrice
          ? '<div class="offrefy-bogo__price">' + esc(getPrice) + "</div>"
          : "";
      return (
        '<div class="offrefy-bogo__tile offrefy-bogo__tile--get' +
        (isFreeGet ? " offrefy-bogo__tile--free" : "") +
        (getPoolCount > 1 ? " offrefy-bogo__tile--multi" : "") +
        '">' +
        '<div class="offrefy-bogo__head">' +
        '<div class="offrefy-bogo__ribbon offrefy-bogo__ribbon--get">' +
        svgGift +
        "<span>" +
        esc(ribbonLabel) +
        "</span></div>" +
        bogoPickerNavHtml() +
        "</div>" +
        bogoGiftPickerHtml() +
        '<div class="offrefy-bogo__foot">' +
        '<div class="offrefy-bogo__foot-copy">' +
        '<div class="offrefy-bogo__name" data-offrefy-bogo-get-name>' +
        (getPoolCount > 1 ? svgGift : "") +
        "<span>" +
        esc(getTitle || "Get item") +
        "</span></div>" +
        (getHint
          ? '<div class="offrefy-bogo__hint">' + esc(getHint) + "</div>"
          : "") +
        "</div>" +
        priceHtml +
        "</div></div>"
      );
    }

    var equationHtml =
      bogoBuyTileHtml() +
      '<span class="offrefy-bogo__op" aria-hidden="true">' +
      svgEquals +
      "</span>" +
      bogoGetTileHtml();

    var ctaAct = String(wd.ctaButtonAction || "add_to_cart");
    if (
      ctaAct !== "add_to_cart" &&
      ctaAct !== "add_to_cart_open_drawer" &&
      ctaAct !== "go_to_checkout" &&
      ctaAct !== "go_to_page"
    ) {
      ctaAct = "add_to_cart";
    }
    var ctaPageUrl = String(wd.ctaButtonPageUrl || "").trim();
    var needsCrossGet =
      !sameDeal && Array.isArray(bogo.getsLines) && bogo.getsLines.length > 0;
    /* Controlled button — honors Display → Button action (not native form-only). */
    var useNativeThemeAtc =
      ctaAct === "add_to_cart" || ctaAct === "add_to_cart_open_drawer";

    try {
      if (root && root.classList) root.classList.add("offrefy-bogo-host");
    } catch (eHost) {}

    var mergedWd = mergeWidgetDisplay(wd);
    var bogoThemeId = String(mergedWd.appearanceTemplateId || "").trim();
    if (!bogoThemeId || bogoThemeId === "custom") {
      bogoThemeId = String(mergedWd.appearanceDecorThemeId || "").trim();
    }
    if (
      !/^(christmas_|newyear_|halloween_|ramadan_|diwali_|pongal_|valentine_|easter_)/.test(
        bogoThemeId,
      )
    ) {
      bogoThemeId = "";
    }
    var cardHtml =
      '<div class="offrefy-bogo' +
      (bogoThemeId ? " offrefy-bogo--themed" : "") +
      '">' +
      '<div class="offrefy-bogo__hero">' +
      '<div class="offrefy-bogo__hero-copy">' +
      '<div class="offrefy-bogo__title"></div>' +
      '<div class="offrefy-bogo__badge">' +
      '<span class="offrefy-bogo__hero-icon" aria-hidden="true">' +
      svgGift +
      "</span>" +
      "<span>" +
      esc(labelBadge) +
      "</span>" +
      "</div>" +
      "</div>" +
      '<p class="offrefy-bogo__sub"></p>' +
      "</div>" +
      '<div class="offrefy-bogo__equation">' +
      equationHtml +
      "</div>" +
      (uses ? '<div class="offrefy-bogo__limit"></div>' : "") +
      (showCta
        ? '<div class="offrefy-bogo__cta-row"><button type="button" class="offrefy-bogo__cta" data-offrefy-bogo-cta>' +
          '<span class="offrefy-bogo__cta-label"></span>' +
          "</button></div>"
        : "") +
      "</div>";
    if (bogoThemeId) {
      cardHtml =
        '<div class="offrefy-bogo-theme-shell" data-offrefy-theme="' +
        bogoThemeId +
        '">' +
        cardHtml +
        "</div>";
    }

    var scope = openBogoScope(mountEl, cardHtml);

    var titleEl = scope.querySelector(".offrefy-bogo__title");
    var subEl = scope.querySelector(".offrefy-bogo__sub");
    var limitEl = scope.querySelector(".offrefy-bogo__limit");
    var ctaEl = scope.querySelector("[data-offrefy-bogo-cta]");
    var ctaLabelEl = scope.querySelector(".offrefy-bogo__cta-label");
    var cardEl = scope.querySelector(".offrefy-bogo");
    if (cardEl) {
      var buyColor = String(bogoCopy.buyColor || "#177245");
      var getColor = String(bogoCopy.getColor || "#9f2d55");
      var buyBg = String(bogoCopy.buyBg || "#f6faf7");
      var getBg = String(bogoCopy.getBg || "#fbf7f9");
      var surface = String(bogoCopy.surfaceColor || "#ffffff");
      var border = String(bogoCopy.borderColor || "#e8e8ea");
      var ink = String(bogoCopy.textColor || "#18181b");
      var muted = String(bogoCopy.mutedColor || "#71717a");
      var badgeBg = String(bogoCopy.badgeBg || "#f4f4f5");
      var badgeText = String(bogoCopy.badgeText || "#52525b");
      cardEl.style.setProperty("--ob-buy", buyColor);
      cardEl.style.setProperty("--ob-buy-soft", buyBg);
      cardEl.style.setProperty(
        "--ob-buy-line",
        "color-mix(in srgb, " + buyColor + " 22%, " + border + ")",
      );
      cardEl.style.setProperty("--ob-get", getColor);
      cardEl.style.setProperty("--ob-get-soft", getBg);
      cardEl.style.setProperty(
        "--ob-get-line",
        "color-mix(in srgb, " + getColor + " 22%, " + border + ")",
      );
      cardEl.style.setProperty("--ob-surface", surface);
      cardEl.style.setProperty("--ob-line", border);
      cardEl.style.setProperty("--ob-ink", ink);
      cardEl.style.setProperty("--ob-muted", muted);
      cardEl.style.setProperty("--ob-badge-bg", badgeBg);
      cardEl.style.setProperty("--ob-badge-text", badgeText);
      if (wd.primaryColor) {
        cardEl.style.setProperty("--ob-cta", String(wd.primaryColor));
      }
      var bogoCardRadius = Number(mergedWd.cardBorderRadiusPx);
      var bogoButtonRadius = Number(mergedWd.buttonBorderRadiusPx);
      if (Number.isFinite(bogoCardRadius)) {
        cardEl.style.setProperty("--ob-radius", Math.round(bogoCardRadius) + "px");
      }
      if (Number.isFinite(bogoButtonRadius)) {
        cardEl.style.setProperty(
          "--ob-cta-radius",
          Math.round(bogoButtonRadius) + "px",
        );
      }
    }
    var bogoCss = String(wd.customCss || "")
      .replace(/<\/style/gi, "")
      .trim();
    if (bogoCss && scope) {
      var bogoCssEl = document.createElement("style");
      bogoCssEl.setAttribute("data-offrefy-bogo-custom-css", "");
      bogoCssEl.textContent = bogoCss.slice(0, 32000);
      scope.insertBefore(bogoCssEl, scope.firstChild);
    }

    if (titleEl) {
      var dealTitle = heroTitle;
      if (!dealTitle || /^special offer$/i.test(dealTitle)) {
        dealTitle =
          "Buy " +
          buysQty +
          ", get " +
          getsQty +
          (isFreeGet ? " free" : "");
      }
      titleEl.textContent = dealTitle;
    }
    if (subEl) subEl.textContent = heroSub;
    if (limitEl) limitEl.textContent = uses;
    if (ctaLabelEl) ctaLabelEl.textContent = ctaLabel;

    root._offrefyBogoSelectedGetIndex = 0;

    function syncBogoGiftSelection(idx, opts) {
      var lines = getsLines;
      if (!lines.length) return;
      var len = lines.length;
      var raw = Number(idx);
      if (!Number.isFinite(raw)) raw = 0;
      var prev = Number(root._offrefyBogoSelectedGetIndex) || 0;
      /* Wrap around so arrows always feel interactive. */
      var next = ((Math.floor(raw) % len) + len) % len;
      var wrapJump =
        (prev === 0 && next === len - 1) || (prev === len - 1 && next === 0);
      var instant = Boolean(opts && opts.instant) || wrapJump;
      root._offrefyBogoSelectedGetIndex = next;

      var track = scope.querySelector("[data-offrefy-bogo-gift-track]");
      if (track) {
        if (instant) track.classList.add("is-instant");
        else track.classList.remove("is-instant");
        track.style.transform =
          "translate3d(-" + String(next * 100) + "%,0,0)";
        if (instant) {
          void track.offsetWidth;
          track.classList.remove("is-instant");
        }
      }

      var slides = scope.querySelectorAll("[data-offrefy-bogo-gift-slide]");
      for (var si = 0; si < slides.length; si++) {
        slides[si].setAttribute(
          "aria-hidden",
          si === next ? "false" : "true",
        );
      }

      var choices = scope.querySelectorAll("[data-offrefy-bogo-gift-idx]");
      for (var di = 0; di < choices.length; di++) {
        var on = di === next;
        choices[di].classList.toggle("is-selected", on);
        choices[di].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    var bogoEmbla = null;

    function syncBogoGiftArrows() {
      var prevBtn = scope.querySelector("[data-offrefy-bogo-gift-prev]");
      var nextBtn = scope.querySelector("[data-offrefy-bogo-gift-next]");
      if (!prevBtn || !nextBtn || !bogoEmbla) return;
      prevBtn.disabled = !bogoEmbla.canScrollPrev();
      nextBtn.disabled = !bogoEmbla.canScrollNext();
    }

    if (getPoolCount > 1) {
      var emblaRoot = scope.querySelector("[data-offrefy-bogo-embla]");
      if (emblaRoot && getPoolCount > 2) {
        try {
          bogoEmbla = EmblaCarousel(emblaRoot, {
            align: "start",
            containScroll: "trimSnaps",
            slidesToScroll: 1,
            dragFree: false,
          });
          bogoEmbla.on("select", syncBogoGiftArrows);
          bogoEmbla.on("reInit", syncBogoGiftArrows);
          bogoEmbla.on("init", syncBogoGiftArrows);
          syncBogoGiftArrows();
        } catch (eEmbla) {
          void eEmbla;
        }
      }
      scope.addEventListener("click", function (ev) {
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        var opt = t.closest("[data-offrefy-bogo-gift-idx]");
        if (opt) {
          ev.preventDefault();
          syncBogoGiftSelection(opt.getAttribute("data-offrefy-bogo-gift-idx"));
          return;
        }
        if (t.closest("[data-offrefy-bogo-gift-prev]")) {
          ev.preventDefault();
          if (bogoEmbla) bogoEmbla.scrollPrev();
          return;
        }
        if (t.closest("[data-offrefy-bogo-gift-next]")) {
          ev.preventDefault();
          if (bogoEmbla) bogoEmbla.scrollNext();
        }
      });
      syncBogoGiftSelection(0, { instant: true });
    }

    bindBogoAtcAssist(root, campaign);

    if (ctaEl) {
      ctaEl.addEventListener("click", function (ev) {
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (ePrev) {
            void ePrev;
          }
        }
        if (ctaEl.disabled) return;

        var liquidForm =
          findVdLiquidProductForm(root) ||
          (liquidFormId ? document.getElementById(liquidFormId) : null);
        var themeForm = findThemeProductCartForm();
        var variantId =
          root.getAttribute("data-variant-id") ||
          readFormVariantId(themeForm) ||
          readFormVariantId(liquidForm) ||
          "";
        if (!variantId || !/^\d+$/.test(String(variantId))) return;

        var attribution = {
          campaignId: campaign && campaign.id ? String(campaign.id) : "",
          productId: productId ? String(productId) : "",
        };
        var bogoUi = {
          ctaButtonAction: ctaAct,
          ctaButtonPageUrl: ctaPageUrl,
        };

        ctaEl.disabled = true;

        /*
         * Same call as quantity break: addVariantToCart → theme product form
         * → completeAfterCartAdd. The selected gift is folded into that
         * /cart/add request (Shopify `items`), not a second add after the drawer.
         */
        var selectedGetId = "";
        if (needsCrossGet) {
          var selectedLine = resolveBogoSelectedGetLine(campaign);
          selectedGetId = selectedLine
            ? bogoIdNumericTail(selectedLine.variantId)
            : "";
        }
        var addSelectedGift =
          selectedGetId &&
          /^\d+$/.test(selectedGetId) &&
          selectedGetId !== String(variantId);

        installBogoGiftOnCartAdd();
        var giftToken = "";
        if (addSelectedGift && ctaAct !== "go_to_checkout") {
          giftToken = String(Date.now()) + ":" + selectedGetId;
          offrefyNs()._offrefyBogoPendingGift = {
            id: selectedGetId,
            qty: getsQty,
            token: giftToken,
          };
          setTimeout(function () {
            var pending = offrefyNs()._offrefyBogoPendingGift;
            if (pending && pending.token === giftToken) {
              offrefyNs()._offrefyBogoPendingGift = null;
            }
          }, 5000);
        }

        var prepare = Promise.resolve();
        if (addSelectedGift && ctaAct === "go_to_checkout") {
          prepare = addBogoPlainCartAdd(selectedGetId, getsQty);
        }

        prepare
          .then(function () {
            if (liquidForm && useNativeThemeAtc && ctaAct !== "go_to_checkout") {
              syncVdLiquidProductForm(
                liquidForm,
                variantId,
                targetBuyQty,
                attribution,
              );
            }
            return addVariantToCart(
              variantId,
              targetBuyQty,
              ctaAct,
              attribution,
            );
          })
          .then(function (addResult) {
            try {
              trackAddToCart(
                campaign,
                productId,
                variantId,
                targetBuyQty,
                0,
              );
            } catch (eTrack) {
              void eTrack;
            }
            ctaEl.disabled = false;
            return completeAfterCartAdd(bogoUi, addResult);
          })
          .catch(function () {
            var pending = offrefyNs()._offrefyBogoPendingGift;
            if (pending && pending.token === giftToken) {
              offrefyNs()._offrefyBogoPendingGift = null;
              if (addSelectedGift) {
                addBogoItemsWithSections(
                  [
                    { id: variantId, quantity: targetBuyQty },
                    { id: selectedGetId, quantity: getsQty },
                  ],
                  false,
                ).then(
                  function () {
                    ctaEl.disabled = false;
                    return completeAfterCartAdd(bogoUi, {
                      redirectHref:
                        ctaAct === "go_to_checkout" ? checkoutUrlHref() : "",
                    });
                  },
                  function () {
                    ctaEl.disabled = false;
                  },
                );
                return;
              }
            }
            ctaEl.disabled = false;
          });
      });
    }

    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.margin = "";
    root.style.padding = "";
    root.style.minHeight = "";
    root.setAttribute("data-offrefy-ready", "1");
    root.setAttribute("data-offrefy-inited", "1");
    mountEl.hidden = false;
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

  /**
   * DISABLED on purpose for cart/drawer qty UX.
   * Fetching /cart.js (or any cart mutation) after theme qty +/- made Valor
   * keep the line-item loading spinner spinning. Locked products sync only
   * on initial scan — never on cart:updated / qty change.
   */
  function scheduleLockedProductsSyncFromCartEvent() {
    return;
  }

  function bindCartDrawerDiscountLabelPatching() {
    /* Disabled: cart:updated / drawer observers ran on every qty +/- and
       competed with theme loading UI. Volume/BOGO badges stay as Shopify paints. */
    if (offrefyNs().cartBadgePatchBound) return;
    offrefyNs().cartBadgePatchBound = true;
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
  var vdLegacyLinePropsStripInFlight = null;
  var vdLegacyLinePropsStripped = false;
  /** Suppress cart-event re-entry while we run our own cart/update (attr cleanup). */
  var vdOwnCartQuietUntil = 0;
  var vdLegacyCleanupStarted = false;
  var VD_ORDER_VISIBLE_LINE_PROPS = [
    OFFREFY_LINE_PROP,
    OFFREFY_CAMPAIGN_PROP,
    OFFREFY_PRODUCT_PROP,
    OFFREFY_CART_FLAG_ATTR,
    OFFREFY_CART_CAMPAIGN_ATTR,
    OFFREFY_CART_PRODUCT_ATTR,
  ];

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

  function linePropertiesObject(raw) {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      var fromArr = {};
      for (var i = 0; i < raw.length; i++) {
        var row = raw[i];
        if (!row) continue;
        var name = row.name != null ? row.name : row.key;
        if (name == null) continue;
        fromArr[String(name)] = row.value != null ? row.value : "";
      }
      return fromArr;
    }
    if (typeof raw === "object") return raw;
    return {};
  }

  function lineHasOffrefyVisibleProps(props) {
    for (var i = 0; i < VD_ORDER_VISIBLE_LINE_PROPS.length; i++) {
      var key = VD_ORDER_VISIBLE_LINE_PROPS[i];
      if (Object.prototype.hasOwnProperty.call(props, key) && props[key] != null) {
        return true;
      }
    }
    return false;
  }

  function stripOffrefyKeysFromProps(props) {
    var next = {};
    var changed = false;
    for (var key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      var drop = false;
      for (var i = 0; i < VD_ORDER_VISIBLE_LINE_PROPS.length; i++) {
        if (key === VD_ORDER_VISIBLE_LINE_PROPS[i]) {
          drop = true;
          break;
        }
      }
      if (drop) {
        changed = true;
        continue;
      }
      next[key] = props[key];
    }
    return changed ? next : null;
  }

  /**
   * Legacy line-prop cleanup MUST NOT call cart/change.js.
   * Sequential property strips (one request per line) race theme cart/drawer
   * remove + qty UI and leave the page stuck on loading spinners.
   * New add-to-cart paths no longer attach Offrefy line properties.
   */
  function stripOffrefyLinePropertiesFromCart(cart) {
    vdLegacyLinePropsStripped = true;
    vdLegacyLinePropsStripInFlight = null;
    return Promise.resolve(cart || null);
  }

  /**
   * Migrate legacy locked-products attr → sessionStorage only.
   * Never POST cart/update.js here — that kept drawer qty spinners alive.
   */
  function clearOrderVisibleVdCartAttributes(cart) {
    vdLegacyLinePropsStripped = true;
    vdLegacyCartAttrsCleared = true;
    vdLegacyCartAttrClearInFlight = null;
    try {
      if (cart && cart.attributes && cart.attributes[VD_LOCKED_PRODUCTS_ATTR]) {
        var legacyLocked = String(cart.attributes[VD_LOCKED_PRODUCTS_ATTR] || "");
        if (legacyLocked && !readLockedProductsSession()) {
          writeLockedProductsSession(legacyLocked);
          vdLastSyncedLockedProducts = legacyLocked;
        }
      }
    } catch (eMig) {
      void eMig;
    }
    return Promise.resolve(cart || null);
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
  /**
   * @param {object|null} cart
   * @param {{ fetch?: boolean }} [opts] — fetch cart.js only when explicitly allowed
   *   (initial page scan). Never fetch after drawer qty +/- (theme loading spinner).
   */
  function syncCartLockedProductsAttribute(cart, opts) {
    var allowFetch = !!(opts && opts.fetch);
    if (!cart && !allowFetch) return Promise.resolve(null);
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
      return c;
    });

    function clearLockedInFlight() {
      if (vdLockedSyncInFlight === promise) vdLockedSyncInFlight = null;
    }
    promise.then(clearLockedInFlight, clearLockedInFlight);

    if (!cart && allowFetch) vdLockedSyncInFlight = promise;
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
    return Promise.resolve();
  }

  /** One-shot legacy cart attribute cleanup (not on every cart:updated). */
  function runLegacyCartCleanupOnce() {
    if (vdLegacyCleanupStarted) return;
    if (vdLegacyCartAttrsCleared && vdLegacyLinePropsStripped) {
      vdLegacyCleanupStarted = true;
      return;
    }
    vdLegacyCleanupStarted = true;
    clearOrderVisibleVdCartAttributes(null).catch(function () {});
  }

  function cartJsUrl() {
    return shopifyRoutesRoot() + "cart.js";
  }

  function checkoutUrlHref() {
    return window.location.origin + "/checkout";
  }

  function collectCartDrawerSectionIds() {
    var ids = [];
    var seen = {};
    function add(id) {
      var s = String(id || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      ids.push(s);
    }
    try {
      var drawer = document.querySelector("cart-drawer");
      if (drawer && typeof drawer.getSectionsToRender === "function") {
        var sections = drawer.getSectionsToRender() || [];
        for (var i = 0; i < sections.length; i++) {
          add(sections[i] && (sections[i].id || sections[i].section));
        }
      }
      if (drawer) {
        add(drawer.getAttribute("data-section-id"));
        add(drawer.dataset && drawer.dataset.sectionId);
      }
    } catch (eDawn) {
      void eDawn;
    }
    try {
      var valor = document.querySelector("valor-cart-drawer");
      if (valor) {
        add(valor.getAttribute("data-section-id"));
        add(valor.getAttribute("section-id"));
        add(valor.dataset && valor.dataset.sectionId);
      }
    } catch (eValor) {
      void eValor;
    }
    add("cart-drawer");
    add("cart-icon-bubble");
    add("cart-notification");
    return ids;
  }

  function findCartDrawerHost() {
    return (
      document.querySelector("valor-cart-drawer") ||
      document.querySelector("cart-drawer") ||
      document.querySelector("#CartDrawer") ||
      document.querySelector("[id*='CartDrawer']") ||
      document.querySelector("[id*='cart-drawer']")
    );
  }

  function resolveCartDrawerSectionId(host) {
    var el = host || findCartDrawerHost();
    if (!el) return "";
    var sid =
      el.getAttribute("data-section-id") ||
      el.getAttribute("section-id") ||
      (el.dataset && (el.dataset.sectionId || el.dataset.section)) ||
      "";
    if (sid) return String(sid);
    var section = el.closest(".shopify-section");
    if (section && section.id) {
      var m = String(section.id).match(/^shopify-section-(.+)$/i);
      if (m && m[1]) return m[1];
    }
    var candidates = collectCartDrawerSectionIds();
    return candidates.length ? candidates[0] : "cart-drawer";
  }

  /** Prefer section that actually wraps the live cart drawer in the DOM. */
  function discoverLiveCartSectionIds() {
    var ids = [];
    var seen = {};
    function add(id) {
      var s = String(id || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      ids.push(s);
    }
    try {
      var sections = document.querySelectorAll(".shopify-section");
      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (
          !sec.querySelector(
            "valor-cart-drawer, cart-drawer, #CartDrawer, [id*='CartDrawer'], [id*='cart-drawer']",
          )
        ) {
          continue;
        }
        var m = String(sec.id || "").match(/^shopify-section-(.+)$/i);
        if (m && m[1]) add(m[1]);
        add(sec.getAttribute("data-section-id"));
      }
    } catch (eWalk) {
      void eWalk;
    }
    var collected = getCartSectionsToRequest();
    for (var c = 0; c < collected.length; c++) add(collected[c]);
    return ids.slice(0, 5);
  }

  function openCartDrawerHost(host) {
    var el = host || findCartDrawerHost();
    if (!el) return;
    try {
      /* Valor uses data-open + body.valor-cart-drawer-open (not Dawn's open attr). */
      if (
        el.tagName &&
        String(el.tagName).toLowerCase() === "valor-cart-drawer"
      ) {
        openValorCartDrawer(el);
        return;
      }
      el.classList.remove("is-empty");
      el.removeAttribute("data-empty");
      el.setAttribute("open", "");
      el.classList.add("active", "is-open", "open");
      document.documentElement.classList.add("overflow-hidden");
      document.body.classList.add("overflow-hidden");
      if (typeof el.show === "function") el.show();
      else if (typeof el.open === "function" && el.open.length === 0) {
        try {
          el.open();
        } catch (eOpen) {
          void eOpen;
        }
      }
    } catch (e) {
      void e;
    }
  }

  function clickThemeCartIcon() {
    var sels = [
      ".valor-header__cart",
      "a.valor-header__cart",
      "#cart-icon-bubble a",
      "#cart-icon-bubble",
      "a.header__icon--cart",
      'a[href="/cart"]',
      'a[href$="/cart"]',
      "[data-cart-toggle]",
      '[data-action="toggle-cart"]',
      'button[aria-controls*="cart" i]',
      'button[aria-controls*="Cart"]',
    ];
    for (var i = 0; i < sels.length; i++) {
      try {
        var el = document.querySelector(sels[i]);
        if (!el) continue;
        el.click();
        return true;
      } catch (eClick) {
        void eClick;
      }
    }
    return false;
  }

  /**
   * Apply fresh section HTML onto the live cart drawer (Valor/Dawn).
   * Replaces the wrapping .shopify-section when possible (empty-state lives there).
   */
  function applyCartDrawerSectionHtml(html, cart) {
    if (!html) return false;
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var nextSection = tmp.querySelector(".shopify-section");
    var next =
      tmp.querySelector("valor-cart-drawer") ||
      tmp.querySelector("cart-drawer") ||
      tmp.querySelector("#CartDrawer") ||
      tmp.querySelector("[id*='CartDrawer']") ||
      tmp.querySelector("[id*='cart-drawer']") ||
      (nextSection && nextSection.firstElementChild) ||
      tmp.firstElementChild;
    if (!next && !nextSection) return false;

    try {
      var host = findCartDrawerHost();
      var liveSection = host && host.closest(".shopify-section");
      if (liveSection && nextSection) {
        liveSection.innerHTML = nextSection.innerHTML;
        host = findCartDrawerHost() || host;
      } else if (host && next) {
        host.className = next.className || host.className;
        host.classList.remove("is-empty");
        host.innerHTML = next.innerHTML;
      } else {
        return false;
      }

      host = findCartDrawerHost() || host;
      if (host) {
        host.classList.remove("is-empty");
        if (cart && (cart.item_count | 0) > 0) {
          host.classList.remove("is-empty");
          host.setAttribute("open", "");
        }
      }
      openCartDrawerHost(host);
      scheduleCartDrawerDiscountLabelPatch();
      updateCartCountBubbles(cart);
      return true;
    } catch (eApply) {
      void eApply;
      return false;
    }
  }

  function htmlLooksLikeCartDrawer(html) {
    var s = String(html || "");
    return /valor-cart-drawer|cart-drawer|CartDrawer|cart__items|cart-item|is-empty/i.test(
      s,
    );
  }

  function fetchCartDrawerSectionHtml() {
    var ids = discoverLiveCartSectionIds();
    if (!ids.length) return Promise.resolve("");
    var root = shopifyRoutesRoot();

    function pickFromSections(sections) {
      if (!sections || typeof sections !== "object") return "";
      for (var i = 0; i < ids.length; i++) {
        var html = sections[ids[i]];
        if (html && htmlLooksLikeCartDrawer(html)) return String(html);
      }
      var keys = Object.keys(sections);
      for (var k = 0; k < keys.length; k++) {
        if (htmlLooksLikeCartDrawer(sections[keys[k]])) {
          return String(sections[keys[k]]);
        }
      }
      return "";
    }

    return fetch(root + "?sections=" + encodeURIComponent(ids.join(",")), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (sections) {
        var picked = pickFromSections(sections);
        if (picked) return picked;
        /* Fallback: section_id on first candidate (Valor). */
        return fetch(root + "?section_id=" + encodeURIComponent(ids[0]), {
          credentials: "same-origin",
        }).then(function (r2) {
          return r2.ok ? r2.text() : "";
        });
      })
      .catch(function () {
        return fetch(root + "?section_id=" + encodeURIComponent(ids[0]), {
          credentials: "same-origin",
        })
          .then(function (r3) {
            return r3.ok ? r3.text() : "";
          })
          .catch(function () {
            return "";
          });
      });
  }

  /**
   * Realtime drawer after BOGO CTA: Liquid section HTML + theme cart icon click.
   * Valor often only paints lines when the header cart control opens the drawer.
   */
  function refreshThemeCartUi(cart) {
    var ns = offrefyNs();
    ns._bogoUiRefreshQuietUntil = Date.now() + 2000;
    var valor = document.querySelector("valor-cart-drawer");
    if (valor && typeof valor.refresh === "function") {
      /* Theme owns drawer HTML. Our section swap races its refresh and
         leaves the empty-state markup on screen until a full reload. */
      return Promise.resolve(valor.refresh())
        .then(function () {
          scheduleCartDrawerDiscountLabelPatch();
          return cart;
        })
        .catch(function () {
          scheduleCartDrawerDiscountLabelPatch();
          return cart;
        });
    }
    publishThemeCartUpdate(cart);
    scheduleCartDrawerDiscountLabelPatch();
    updateCartCountBubbles(cart);

    try {
      var dawnDrawer = document.querySelector("cart-drawer");
      if (dawnDrawer) {
        if (typeof dawnDrawer.onCartUpdate === "function") {
          Promise.resolve(dawnDrawer.onCartUpdate()).catch(function () {});
        }
        if (
          typeof dawnDrawer.renderContents === "function" &&
          typeof dawnDrawer.getSectionsToRender === "function"
        ) {
          var sectionIds = discoverLiveCartSectionIds();
          if (sectionIds.length) {
            fetch(
              shopifyRoutesRoot() +
                "?sections=" +
                encodeURIComponent(sectionIds.join(",")),
              {
                credentials: "same-origin",
                headers: { Accept: "application/json" },
              },
            )
              .then(function (r) {
                return r.ok ? r.json() : null;
              })
              .then(function (sections) {
                if (!sections || typeof sections !== "object") return;
                try {
                  dawnDrawer.renderContents({ sections: sections });
                } catch (eRender) {
                  void eRender;
                }
                openCartDrawerHost(dawnDrawer);
                scheduleCartDrawerDiscountLabelPatch();
              })
              .catch(function () {});
          }
        }
      }
    } catch (eD) {
      void eD;
    }

    try {
      var valor = document.querySelector("valor-cart-drawer");
      if (valor) {
        if (typeof valor.refresh === "function") valor.refresh();
        else if (typeof valor.updateCart === "function") valor.updateCart(cart);
        else if (typeof valor.renderCart === "function") valor.renderCart(cart);
        else if (typeof valor.fetchAndRender === "function") {
          valor.fetchAndRender();
        } else if (typeof valor.getCart === "function") {
          Promise.resolve(valor.getCart()).catch(function () {});
        }
        if (typeof valor.updateCartCount === "function" && cart) {
          valor.updateCartCount({ item_count: cart.item_count | 0 });
        }
      }
    } catch (eV) {
      void eV;
    }

    return fetchCartDrawerSectionHtml()
      .then(function (html) {
        var painted = html ? applyCartDrawerSectionHtml(html, cart) : false;
        openCartDrawerHost(findCartDrawerHost());
        /*
         * One cart-icon open only when drawer still empty after paint.
         * Never double-click — that stacked Valor qty handlers.
         */
        var host = findCartDrawerHost();
        var empty =
          !painted ||
          (host &&
            (host.classList.contains("is-empty") ||
              /your cart is empty/i.test(String(host.textContent || ""))));
        if (empty) {
          clickThemeCartIcon();
          openCartDrawerHost(findCartDrawerHost());
        }
        scheduleCartDrawerDiscountLabelPatch();
        setTimeout(scheduleCartDrawerDiscountLabelPatch, 250);
        return cart;
      })
      .catch(function () {
        openCartDrawerHost(findCartDrawerHost());
        clickThemeCartIcon();
        return cart;
      });
  }

  function dispatchCartRefresh(cart) {
    return refreshThemeCartUi(cart);
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
            return Promise.resolve(dispatchCartRefresh(cart)).then(
              function () {
                return cart;
              },
            );
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
              option1: v.option1 != null ? v.option1 : null,
              option2: v.option2 != null ? v.option2 : null,
              option3: v.option3 != null ? v.option3 : null,
            };
          }),
        );
        var optNames = Array.isArray(pj.options) ? pj.options : [];
        var optionsScript = root.querySelector("script[data-offrefy-options-json]");
        if (!optionsScript) {
          optionsScript = document.createElement("script");
          optionsScript.type = "application/json";
          optionsScript.setAttribute("data-offrefy-options-json", "");
          root.insertBefore(optionsScript, root.firstChild);
        }
        optionsScript.textContent = JSON.stringify(optNames);
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
        var scope =
          mountEl.querySelector(".offrefy-card--selected") || mountEl;
        var hid = scope.querySelector("[data-offrefy-variant]");
        if (hid && hid.value) return String(hid.value);
        var selAdd = scope.querySelector("select[data-offrefy-variant]");
        if (selAdd && selAdd.value) return String(selAdd.value);
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

    function parseProductOptionNames() {
      var el = root.querySelector("script[data-offrefy-options-json]");
      if (el && el.textContent) {
        try {
          var arr = JSON.parse(el.textContent.trim());
          if (Array.isArray(arr) && arr.length) {
            return arr.map(function (n) {
              return String(n || "").trim();
            }).filter(Boolean);
          }
        } catch (eOpt) {
          void eOpt;
        }
      }
      var names = [];
      if (variants.some(function (v) { return v && v.option1; })) names.push("Option 1");
      if (variants.some(function (v) { return v && v.option2; })) names.push("Option 2");
      if (variants.some(function (v) { return v && v.option3; })) names.push("Option 3");
      return names;
    }

    function variantOptionKey(index) {
      return index === 0 ? "option1" : index === 1 ? "option2" : "option3";
    }

    function uniqueOptionValues(optIndex) {
      var key = variantOptionKey(optIndex);
      var seen = {};
      var out = [];
      for (var i = 0; i < variants.length; i++) {
        var raw = variants[i] && variants[i][key];
        var val = raw != null ? String(raw) : "";
        if (!val || seen[val]) continue;
        seen[val] = true;
        out.push(val);
      }
      return out;
    }

    function findVariantByOptions(o1, o2, o3) {
      for (var i = 0; i < variants.length; i++) {
        var v = variants[i];
        if (!v) continue;
        if (o1 != null && String(v.option1 || "") !== String(o1)) continue;
        if (o2 != null && String(v.option2 || "") !== String(o2)) continue;
        if (o3 != null && String(v.option3 || "") !== String(o3)) continue;
        return v;
      }
      return null;
    }

    function findVariantById(vid) {
      var id = String(vid || "");
      for (var i = 0; i < variants.length; i++) {
        if (String(variants[i].id) === id) return variants[i];
      }
      return null;
    }

    /**
     * System-default <select>s only.
     * Multi-option products → one short select per option (Size / Color / …)
     * so the OS menu stays small and does not cover the whole product form.
     * Single-axis / legacy → one native select of variant titles.
     */
    function nativeVariantSelectHtml(selId) {
      if (!vdShowVariant) return "";
      var want = String(selId || firstAvailableVariantIdInList(variants) || "");
      var selected = findVariantById(want) || variants[0];
      var optionNames = parseProductOptionNames();
      var useAxes =
        optionNames.length > 0 &&
        selected &&
        (selected.option1 != null || selected.option2 != null || selected.option3 != null);

      if (!useAxes) {
        var html =
          '<select data-offrefy-variant data-offrefy-isolate="1" aria-label="Variant" autocomplete="off">';
        for (var vi = 0; vi < variants.length; vi++) {
          var v = variants[vi];
          var id = String(v.id);
          html +=
            '<option value="' +
            esc(id) +
            '"' +
            (id === want ? " selected" : "") +
            (v.available === false ? " disabled" : "") +
            ">" +
            esc(String(v.title || "Variant")) +
            "</option>";
        }
        html += "</select>";
        return html;
      }

      var optionCount = 0;
      var labelsHtml = "";
      for (var oi = 0; oi < optionNames.length; oi++) {
        var values = uniqueOptionValues(oi);
        if (!values.length) continue;
        optionCount += 1;
        var key = variantOptionKey(oi);
        var cur = selected && selected[key] != null ? String(selected[key]) : values[0];
        var label = optionNames[oi] || "Option";
        labelsHtml +=
          '<label class="offrefy-variant-options__label">' +
          '<span class="offrefy-variant-options__name">' +
          esc(label) +
          "</span>" +
          '<select data-offrefy-option-index="' +
          String(oi) +
          '" data-offrefy-isolate="1" aria-label="' +
          esc(label) +
          '" autocomplete="off">';
        for (var uj = 0; uj < values.length; uj++) {
          var ov = values[uj];
          labelsHtml +=
            '<option value="' +
            esc(ov) +
            '"' +
            (ov === cur ? " selected" : "") +
            ">" +
            esc(ov) +
            "</option>";
        }
        labelsHtml += "</select></label>";
      }
      var block =
        '<div class="offrefy-variant-options" data-offrefy-variant-options data-offrefy-option-count="' +
        String(optionCount) +
        '" data-offrefy-isolate="1">' +
        labelsHtml +
        '<input type="hidden" data-offrefy-variant value="' +
        esc(want) +
        '" />' +
        "</div>";
      return block;
    }

    function readOptionsFromBlock(block) {
      var o1 = null;
      var o2 = null;
      var o3 = null;
      var sels = block.querySelectorAll("select[data-offrefy-option-index]");
      for (var i = 0; i < sels.length; i++) {
        var idx = parseInt(String(sels[i].getAttribute("data-offrefy-option-index") || ""), 10);
        var val = String(sels[i].value || "");
        if (idx === 0) o1 = val;
        else if (idx === 1) o2 = val;
        else if (idx === 2) o3 = val;
      }
      return { option1: o1, option2: o2, option3: o3 };
    }

    function applyVariantIdEverywhere(vid) {
      var id = String(vid || "");
      if (!id) return;
      currentUnitCents = readPriceForVariant(id);
      syncAllVariantSelects(id);
      updateAllPrices();
      updateQtyDisplay();
      syncFormVariant(id);
      root.setAttribute("data-variant-id", id);
      updatePurchaseControlsAvailability();
    }

    function expandHtml(c, selId) {
      var selectBlock = nativeVariantSelectHtml(selId);
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
      var row = findVariantById(id);
      var hiddens = mountEl.querySelectorAll("[data-offrefy-variant]");
      for (var hi = 0; hi < hiddens.length; hi++) {
        if (String(hiddens[hi].value) !== id) hiddens[hi].value = id;
      }
      var titleSelects = mountEl.querySelectorAll("select[data-offrefy-variant]");
      for (var si = 0; si < titleSelects.length; si++) {
        if (String(titleSelects[si].value) !== id) titleSelects[si].value = id;
      }
      if (!row) return;
      var blocks = mountEl.querySelectorAll("[data-offrefy-variant-options]");
      for (var bi = 0; bi < blocks.length; bi++) {
        var sels = blocks[bi].querySelectorAll("select[data-offrefy-option-index]");
        for (var oi = 0; oi < sels.length; oi++) {
          var idx = parseInt(
            String(sels[oi].getAttribute("data-offrefy-option-index") || ""),
            10,
          );
          var key = variantOptionKey(idx);
          var wantVal = row[key] != null ? String(row[key]) : "";
          if (wantVal && String(sels[oi].value) !== wantVal) {
            sels[oi].value = wantVal;
          }
        }
      }
    }

    function scrollToAtc() {
      clampQty();
      syncQtyToForm(false);
      var sel = mountEl.querySelector(
        ".offrefy-card--selected [data-offrefy-variant]",
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
    mountEl.hidden = false;
    if (root) {
      root.removeAttribute("hidden");
      root.hidden = false;
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
        if (ev.stopPropagation) ev.stopPropagation();
        ensureCardSelectedFromNode(t);
        applyQtyFromInput(t);
        return;
      }
      if (
        vdShowVariant &&
        t &&
        t.tagName === "SELECT" &&
        t.getAttribute &&
        (t.getAttribute("data-offrefy-variant") != null ||
          t.getAttribute("data-offrefy-option-index") != null)
      ) {
        /* Keep theme product-form JS from reacting to our isolated select. */
        if (ev.stopPropagation) ev.stopPropagation();
        if (ensureCardSelectedFromNode(t)) {
          stateQty = getTierMinQty();
        }
        var nextId = "";
        if (t.getAttribute("data-offrefy-option-index") != null) {
          var block = t.closest("[data-offrefy-variant-options]");
          if (!block) return;
          var picked = readOptionsFromBlock(block);
          var match = findVariantByOptions(
            picked.option1,
            picked.option2,
            picked.option3,
          );
          if (!match) {
            /* Soft fallback: keep first option match even if later axes conflict. */
            match = findVariantByOptions(picked.option1, null, null);
          }
          if (!match) return;
          nextId = String(match.id);
          var hid = block.querySelector("[data-offrefy-variant]");
          if (hid) hid.value = nextId;
        } else {
          nextId = String(t.value || "");
        }
        if (!nextId) return;
        applyVariantIdEverywhere(nextId);
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
          "select[data-offrefy-variant], select[data-offrefy-option-index], [data-offrefy-variant-options], [data-offrefy-qty-dec], [data-offrefy-qty-inc], [data-offrefy-tier-add], [data-offrefy-qty-display], .offrefy-qty-group, .offrefy-qty-btn, .offrefy-add-outline",
        )
      );
    }

    /**
     * Theme-safe: after the control handles the event, stop bubbling so theme
     * product-form listeners (document/body) do not react. Capture must NOT
     * stopPropagation — that would block the native <select> / buttons.
     */
    mountEl.addEventListener("pointerdown", function (ev) {
      if (!isExpandControlTarget(ev.target)) return;
      if (ev.stopPropagation) ev.stopPropagation();
    });
    mountEl.addEventListener("click", function (ev) {
      if (!isExpandControlTarget(ev.target)) return;
      if (ev.stopPropagation) ev.stopPropagation();
    });

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
      if (!isVolumeTable && !isExpandControlTarget(ev.target)) {
        var clickCard =
          ev.target && ev.target.closest
            ? ev.target.closest(".offrefy-card")
            : null;
        if (clickCard) {
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
    offrefyNs().embed.version = "1.31.90";

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

    var collectionGids = readCollectionGidsFromRoot(root);

    function applyConfig(cfg) {
      var camp = pickCampaign(
        cfg,
        productId,
        variantId,
        productGid,
        variantGid,
        collectionGids,
      );
      if (
        (!camp || (!isBogoCampaign(camp) && (!camp.tiers || !camp.tiers.length))) &&
        productRuleCampaign &&
        campaignUsableOnStorefront(productRuleCampaign)
      ) {
        camp = productRuleCampaign;
      }
      if (
        (!camp || (!isBogoCampaign(camp) && (!camp.tiers || !camp.tiers.length))) &&
        designMode
      ) {
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
      if (!camp || (!isBogoCampaign(camp) && (!camp.tiers || !camp.tiers.length))) {
        root.setAttribute("hidden", "");
        root.style.display = "none";
        root.style.margin = "0";
        root.style.padding = "0";
        root.style.minHeight = "0";
        root.removeAttribute("data-offrefy-ready");
        mount.hidden = true;
        return;
      }
      /* Matching offer found — unhide before paint so empty-block CSS cannot stick. */
      root.removeAttribute("hidden");
      root.hidden = false;
      root.style.display = "";
      root.style.removeProperty("margin");
      root.style.removeProperty("padding");
      root.style.removeProperty("min-height");
      mount.hidden = false;
      if (cfg && cfg.translations) {
        camp.translations = cfg.translations;
      }
      if (isBogoCampaign(camp)) {
        mountBogoBundle(root, mount, camp);
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
      collectionGids,
    );

    if (
      designMode &&
      (!matched ||
        (!isBogoCampaign(matched) && (!matched.tiers || !matched.tiers.length)))
    ) {
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
      (!matched ||
        (!isBogoCampaign(matched) && (!matched.tiers || !matched.tiers.length))) &&
      productRuleCampaign &&
      campaignUsableOnStorefront(productRuleCampaign)
    ) {
      matched = productRuleCampaign;
    }

    if (
      matched &&
      (isBogoCampaign(matched) || (matched.tiers && matched.tiers.length))
    ) {
      if (inline && inline.translations) {
        matched.translations = inline.translations;
      }
      if (isBogoCampaign(matched)) {
        /*
         * Only early-paint when Get/Buy media is complete. Incomplete metafield
         * JSON + later /widget-config remount was flashing wrong qty/price.
         */
        if (bogoCampaignHasStableTileMedia(matched, productId)) {
          mountBogoBundle(root, mount, matched);
        } else {
          root.removeAttribute("hidden");
          root.style.display = "";
          paintBogoPendingSkeleton(mount);
        }
        /* Still fetch /widget-config so enriched media can paint once. */
      } else if (!matched._fromProductRule) {
        // Product-rule early paint lacks full widgetDisplay — still fetch /widget-config
        // so countdown + appearance from the offer are applied.
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
      } else {
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
    }

    function finishFetch(remote) {
      if (!root.isConnected) return;
      var hadProductRulePaint =
        root.getAttribute("data-offrefy-inited") === "1" &&
        productRuleCampaign;
      var waitingBogoEnrichment =
        root.getAttribute("data-offrefy-inited") !== "1" &&
        mount.querySelector(".offrefy-bogo--pending");
      if (
        root.getAttribute("data-offrefy-inited") === "1" &&
        !hadProductRulePaint &&
        !waitingBogoEnrichment
      ) {
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
      /* Prefetch/remote empty → keep inline BOGO so we don't blank the offer. */
      if (
        (!cfg.campaigns || !cfg.campaigns.length) &&
        matched &&
        isBogoCampaign(matched)
      ) {
        cfg = sanitizeWidgetConfig(
          { version: 1, campaigns: [matched] },
          designMode,
        );
        if (inline && inline.translations) {
          cfg.translations = inline.translations;
        }
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

    /*
     * Enable when App Embed is on, OR when the Quantity breaks block is on
     * the page (block script arms appEmbedActive). Presence of widget host
     * markup is enough — don’t leave the product page blank on Horizon.
     */
    var hasWidgetHost = !!document.querySelector(
      ".offrefy-root[data-offrefy-widget-host], .offrefy-root[data-offrefy-root]",
    );
    if (!offrefyNs().appEmbedActive) {
      if (hasWidgetHost) {
        offrefyNs().appEmbedActive = true;
      } else {
        hideAllWidgetRoots();
        return;
      }
    }

    /* Widget first — never wait on cart network before mounting. */
    document.querySelectorAll(".offrefy-root").forEach(function (el) {
      try {
        runWidget(el);
      } catch (eRun) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[Offrefy] widget mount failed", eRun);
        }
      }
    });

    /* BOGO: no cart drawer/page assist — free Get only via widget CTA. */

    bindCartDrawerDiscountLabelPatching();
    bindStorefrontLocaleWatcher();
    bindAtcAttributionFlush();
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
      /* No cart.js / cart/update on boot — avoids racing drawer qty spinner. */
      void syncCartSideEffects;
      syncCartLocaleAttribute(false).catch(function () {});
    }

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runCartSideEffects, { timeout: 2500 });
    } else {
      setTimeout(runCartSideEffects, 500);
    }
  }

  /*
   * Mount ASAP — don’t wait for full DOMContentLoaded when widget roots
   * are already in the document (kills refresh delay).
   */
  function bootScan() {
    scan({ syncCart: true });
  }
  if (
    document.querySelector(".offrefy-root[data-offrefy-root]") ||
    document.readyState !== "loading"
  ) {
    bootScan();
  } else {
    document.addEventListener("DOMContentLoaded", bootScan);
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

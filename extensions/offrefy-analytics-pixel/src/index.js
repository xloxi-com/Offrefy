import { register } from "@shopify/web-pixels-extension";

var OFFREFY_MARKERS = ["offrefy", "quantity breaks"];

function hasOffrefySignal(checkout) {
  if (!checkout) return false;

  var attrs = checkout.attributes || [];
  for (var i = 0; i < attrs.length; i++) {
    var key = String(attrs[i].key || "").toLowerCase();
    if (
      key === "offrefy" ||
      key === "offrefy_campaign" ||
      key === "offrefy_product"
    ) {
      return true;
    }
  }

  var apps = checkout.discountApplications || [];
  for (var j = 0; j < apps.length; j++) {
    var title = String(apps[j].title || "").toLowerCase();
    for (var m = 0; m < OFFREFY_MARKERS.length; m++) {
      if (title.indexOf(OFFREFY_MARKERS[m]) !== -1) return true;
    }
  }

  var lines = checkout.lineItems || [];
  for (var k = 0; k < lines.length; k++) {
    var props = lines[k].properties || [];
    for (var p = 0; p < props.length; p++) {
      var propKey = String(props[p].key || "").toLowerCase();
      if (
        propKey === "_offrefy" ||
        propKey === "_offrefy_campaign" ||
        propKey === "offrefy" ||
        propKey === "offrefy_campaign"
      ) {
        return true;
      }
    }
    var allocations = lines[k].discountAllocations || [];
    for (var a = 0; a < allocations.length; a++) {
      var allocTitle = String(
        (allocations[a].discountApplication &&
          allocations[a].discountApplication.title) ||
          "",
      ).toLowerCase();
      for (var n = 0; n < OFFREFY_MARKERS.length; n++) {
        if (allocTitle.indexOf(OFFREFY_MARKERS[n]) !== -1) return true;
      }
    }
  }

  return false;
}

register(function (api) {
  var analytics = api.analytics;
  var settings = api.settings;
  var init = api.init;

  analytics.subscribe("checkout_completed", function (event) {
    var checkout = event && event.data && event.data.checkout;
    if (!checkout || !hasOffrefySignal(checkout)) return;

    var shopDomain =
      (init &&
        init.data &&
        init.data.shop &&
        init.data.shop.myshopifyDomain) ||
      "";
    var appUrl = String((settings && settings.appUrl) || "").replace(/\/$/, "");
    if (!shopDomain || !appUrl) return;

    var url =
      appUrl +
      "/apps/volume-discount/analytics?shop=" +
      encodeURIComponent(shopDomain);

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        checkoutCompleted: true,
        checkout: checkout,
      }),
      keepalive: true,
    }).catch(function () {});
  });
});

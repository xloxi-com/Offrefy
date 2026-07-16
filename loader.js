(function(){
  var O="https://offrey.xloxi.com";
  var V="1.26.0";
  try { window.__vdAppOrigin = window.__vdAppOrigin || O; } catch (e) {}
  try { window.__vdAssetVersion = window.__vdAssetVersion || V; } catch (e2) {}
  if (!document.querySelector('link[data-vd-hosted-css="1"],link[href*="volume-discount-storefront.css"],link[href*="/vd-storefront.css"]')) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = O + "/vd-storefront.css?v=" + encodeURIComponent(V);
    l.setAttribute("data-vd-hosted-css", "1");
    (document.head || document.documentElement).appendChild(l);
  }
  if (!document.querySelector('script[data-vd-main="1"],script[src*="volume-discount-storefront.js"],script[src*="/vd-storefront.js"]')) {
    var s = document.createElement("script");
    s.src = O + "/vd-storefront.js?v=" + encodeURIComponent(V);
    s.defer = true;
    s.setAttribute("data-vd-main", "1");
    (document.head || document.documentElement).appendChild(s);
  }
})();
import { chromium } from "playwright";

const PASS = "123";
const URL =
  "https://offrefy-qzj4kjnw.myshopify.com/products/boga-pomme-pack-6x1-5l-x84-fr";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("https://offrefy-qzj4kjnw.myshopify.com/password", {
  waitUntil: "domcontentloaded",
});
const passInput = page.locator('input[name="password"], #Password, input[type="password"]');
if (await passInput.count()) {
  await passInput.first().fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => {}),
    page.locator('button[type="submit"], input[type="submit"], button:has-text("Enter")').first().click(),
  ]);
}

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('button[data-qty-action="increase"]', { timeout: 30000 });
await page.waitForTimeout(2500);

const qty = page.locator('input.valor-mp__quantity-input, input[name="quantity"]').first();
const plus = page.locator('button[data-qty-action="increase"]').first();

const before = await qty.inputValue();
const xloxiNamedQty = await page.locator('.xloxi-root input[name="quantity"]').count();
const xloxiLiquidQty = await page.locator("[data-xloxi-liquid-qty]").count();
const embed = await page.evaluate(() => !!window.__xloxiAppEmbedActive);
const jsVer = await page.evaluate(() =>
  window.Xloxi && window.Xloxi.embed ? window.Xloxi.embed.version : null,
);

await plus.click();
await page.waitForTimeout(300);
const after1 = await qty.inputValue();
await plus.click();
await page.waitForTimeout(300);
const after2 = await qty.inputValue();

console.log(
  JSON.stringify(
    {
      before,
      after1Click: after1,
      after2Clicks: after2,
      works: Number(after2) === Number(before) + 2 || Number(after1) === Number(before) + 1,
      xloxiNamedQtyInsideRoot: xloxiNamedQty,
      xloxiLiquidQtyEls: xloxiLiquidQty,
      embed,
      jsVer,
      title: await page.title(),
    },
    null,
    2,
  ),
);

await browser.close();

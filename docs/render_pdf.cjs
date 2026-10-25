// Renders docs/criteria.html to docs/Outpost_Decision_Criteria_and_Flow.pdf with headless Chromium.
const path = require("path");
const { chromium } = require(process.env.PW_CORE || "playwright-core");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(__dirname, "criteria.html"), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({
    path: path.join(__dirname, "Outpost_Decision_Criteria_and_Flow.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;padding:0 15mm;font-family:monospace;font-size:7px;color:#65655f;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.04em"><span>Outpost · Decision criteria and system flow</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await b.close();
  console.log("pdf written");
})();

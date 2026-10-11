// Development-only export of Apple's static startup images. The live spinner
// is provided by launch.css after the document starts; these PNGs are static.
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium: playwright } = require(
  process.env.STATIONSBORD_PLAYWRIGHT_MODULE || "playwright",
);

const publicDir = path.resolve(__dirname, "../server/src/public");
// Portrait CSS screen dimensions and device pixel ratio. Landscape exports
// reuse the device dimensions with an explicit orientation media condition.
const screens = [
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [414, 896, 2],
  [414, 896, 3],
  [428, 926, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1194, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
];

(async () => {
  const launchOptions = { headless: true };
  if (process.env.STATIONSBORD_CHROMIUM_MODULE) {
    const chromium = require(process.env.STATIONSBORD_CHROMIUM_MODULE).default;
    launchOptions.executablePath = await chromium.executablePath();
    launchOptions.args = chromium.args;
  }
  const browser = await playwright.launch(launchOptions);
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const mark = (await fs.readFile(path.join(publicDir, "mark.svg"))).toString(
      "base64",
    );
    const version = JSON.parse(
      await fs.readFile(path.join(publicDir, "../../package.json"), "utf8"),
    ).version;
    const directory = path.join(publicDir, "assets/launch");
    await fs.mkdir(directory, { recursive: true });
    const links = [];
    for (const [deviceWidth, deviceHeight, ratio] of screens) {
      for (const orientation of ["portrait", "landscape"]) {
        const width =
          (orientation === "portrait" ? deviceWidth : deviceHeight) * ratio;
        const height =
          (orientation === "portrait" ? deviceHeight : deviceWidth) * ratio;
        await page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"]) {
          const dark = theme === "dark";
          await page.setContent(`<!doctype html><html><head><style>
            * {box-sizing:border-box} body {margin:0; min-height:100vh; display:flex;
              flex-direction:column; align-items:center; justify-content:center;
              background:${dark ? "#182226" : "#f6f3eb"}; color:${dark ? "#ecece3" : "#263943"};
              font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
            img {width:${64 * ratio}px;height:${64 * ratio}px}
            p {font-size:${24 * ratio}px;font-weight:650;line-height:1.25;margin:${18 * ratio}px 0 0}
            span {width:${22 * ratio}px;height:${22 * ratio}px;margin-top:${26 * ratio}px;
              border:${2 * ratio}px solid ${dark ? "#405057" : "#9da9a8"};
              border-top-color:${dark ? "#a9c9d4" : "#284c60"};border-radius:50%}
          </style></head><body><img src="data:image/svg+xml;base64,${mark}"><p>Stationsbord</p><span></span></body></html>`);
          await page.locator("img").evaluate((image) => image.decode());
          const filename = `${width}x${height}-${theme}.png`;
          await page.screenshot({ path: path.join(directory, filename) });
          links.push(
            `<link rel="apple-touch-startup-image" href="/assets/launch/${filename}?v=${version}" media="(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation}) and (prefers-color-scheme: ${theme})" />`,
          );
        }
      }
    }
    const htmlPath = path.join(publicDir, "index.html");
    const html = await fs.readFile(htmlPath, "utf8");
    if (!html.includes("<!-- startup-images:start -->"))
      throw new Error("Missing startup image markers");
    await fs.writeFile(
      htmlPath,
      html.replace(
        /<!-- startup-images:start -->[\s\S]*?<!-- startup-images:end -->/,
        `<!-- startup-images:start -->\n${links.join("\n")}\n<!-- startup-images:end -->`,
      ),
    );
    console.log(
      `Exported ${links.length} static startup images and their media links.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

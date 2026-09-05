import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const productionHost = process.env.YIJING_PRODUCTION_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.YIJING_PRODUCTION_PORT ?? 3000);
const productionPort = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
  ? requestedPort
  : 3000;
const productionBaseURL = `http://${productionHost}:${productionPort}`;

export default defineConfig({
  ...baseConfig,
  // Production browser runs exercise database startup in several files at
  // once. A single retry absorbs transient browser/worker startup contention
  // without masking deterministic assertion failures.
  retries: process.env.CI ? 2 : 1,
  // A navigation that never reaches a document-ready boundary should not
  // consume the entire production process budget. WebKit gets a slightly
  // larger per-navigation allowance because its macOS process startup can
  // occasionally spend more than 30s opening the first database-backed page;
  // the outer runner still enforces a finite suite budget and retry policy.
  use: {
    ...baseConfig.use,
    baseURL: productionBaseURL,
    navigationTimeout: process.env.PLAYWRIGHT_PROD_BROWSER === "webkit"
      ? 45_000
      : 30_000,
  },
  projects: baseConfig.projects?.filter((project) => (
    process.env.PLAYWRIGHT_PROD_BROWSER
      ? project.name === process.env.PLAYWRIGHT_PROD_BROWSER
      : project.name !== "firefox"
  )),
  webServer: {
    command: `npm run start -- --hostname ${productionHost} --port ${productionPort}`,
    url: productionBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

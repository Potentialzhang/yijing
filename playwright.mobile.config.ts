import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

const production = process.env.MOBILE_E2E_PRODUCTION === "1";

export default defineConfig({
  ...baseConfig,
  testMatch: /mobile\.spec\.ts/,
  testIgnore: [],
  fullyParallel: true,
  webServer: production
    ? {
        command: "npm run start -- --hostname 127.0.0.1 --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : baseConfig.webServer,
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
    { name: "tablet-webkit", use: { ...devices["iPad Mini"] } },
  ],
});

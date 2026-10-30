import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: path.join(os.tmpdir(), "kc-playwright-results"),
  timeout: 35000,
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
    headless: true,
    trace: "retain-on-failure",
    ...(process.env.KC_TEST_BROWSER
      ? { launchOptions: { executablePath: process.env.KC_TEST_BROWSER } }
      : {}),
  },
  projects: [
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://localhost:8088",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH }
  },
  webServer: { command: "npm start", url: "http://localhost:8088", reuseExistingServer: !process.env.CI }
});

import { defineConfig } from "@playwright/test";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command:
      "node scripts/reset-e2e-database.mjs && npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "file:./data/e2e.db",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin12345",
      APP_ENCRYPTION_KEY: encryptionKey,
      SESSION_COOKIE_SECURE: "false",
      SPECCHAIN_E2E: "true",
    },
  },
});

export const PLAYWRIGHT_TEST_TIMEOUT_MS = 10 * 60 * 1_000;

export function buildPlaywrightConfig(baseUrl: string) {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: ${PLAYWRIGHT_TEST_TIMEOUT_MS},
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  outputDir: "./test-results",
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  use: {
    baseURL: ${JSON.stringify(baseUrl)},
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
});
`;
}

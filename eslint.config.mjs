import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".playwright-cli/**",
    "data/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "src/generated/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

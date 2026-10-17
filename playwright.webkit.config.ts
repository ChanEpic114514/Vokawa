import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: ["lens.e2e.spec.ts", "anywhere.e2e.spec.ts"], outputDir: "test-results/webkit", use: { ...base.use, browserName: "webkit", launchOptions: {} } });

import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=tests/e2e/fixtures/visit.wav"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "node tests/e2e/mock-fhir.mjs",
      url: "http://localhost:3297/stats",
      reuseExistingServer: false,
      env: { MOCK_FHIR_PORT: "3297" },
    },
    {
      command: "node tests/e2e/mock-deepgram.mjs",
      url: "http://localhost:3299/stats",
      reuseExistingServer: false,
      env: { MOCK_DG_PORT: "3299" },
    },
    {
      command: `rm -rf data/e2e.db data/e2e.db-wal data/e2e.db-shm data/audio && npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        CHARTSIDE_DB: "data/e2e.db",
        CHARTSIDE_ENGINE: "local",
        CHARTSIDE_INSECURE_COOKIES: "1",
        DEEPGRAM_API_KEY: "test-key",
        DEEPGRAM_BASE_URL: "http://localhost:3299",
        DEEPGRAM_WS_URL: "ws://localhost:3299/v1/listen",
        SMART_CLIENT_ID: "chartside-test",
        SMART_ISS: "http://localhost:3297/fhir",
        SMART_LABEL: "Epic",
      },
    },
  ],
});

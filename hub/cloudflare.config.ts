import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "c9bf3d8e875ffe933a9bf895695e0fd1", // Datum Labs
  worker: defineWorker({
    name: "setnel-hub",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-05",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Plain (non-secret) settings. The hub's own public URL, used in alert, digest and email links.
      // Secrets (DATABASE_URL, TELEGRAM_*, SETNEL_PASSWORD, SETNEL_SESSION_SECRET, SETNEL_CRON_SECRET,
      // SETNEL_DASHBOARD_SECRET_<ID>, ANTHROPIC_API_KEY, ONCHAINSUITE_SECRET_KEY, ...) are Worker secrets.
      SETNEL_SELF_URL: bindings.text("https://setnel-hub.datumlabs.workers.dev"),
    },
  }),
});

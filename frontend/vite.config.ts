import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  define: { "globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__": mode === "portfolio-demo" },
  plugins: [react(), mode === "portfolio-demo" && {
    name: "portfolio-demo-exclude-fixtures",
    enforce: "pre",
    resolveId(source, importer) {
      if (/^(?:\.\.\/)+mocks\/fixtures\//.test(source)
        || /^\.\/(?:DedicatedAnalyticsDemo|MonthlyOverviewPreview)$/.test(source)) {
        return this.resolve("/src/mocks/noProjectFixtures.ts", importer, { skipSelf: true });
      }
    },
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (/\/mocks\/fixtures\/|\/(?:DedicatedAnalyticsDemo|MonthlyOverviewPreview|dedicatedAnalyticsDemoData|dedicatedAnalyticsDemoExpenses|analyticsFuturePreviewData|monthlyOverviewPreviewData)\./.test(id)) {
          this.error("Fixture module in portfolio-demo graph: " + id);
        }
      }
    },
  }],
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${Number(loadEnv(mode, ".", "SERVER_PORT").SERVER_PORT ?? 8080)}`,
        changeOrigin: true,
      },
    },
  },
}));

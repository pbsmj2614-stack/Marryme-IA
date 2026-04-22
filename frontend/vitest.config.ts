import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/supabase*.ts",
        "src/lib/posthog.ts",
        "src/lib/exportDocx.ts",
        "src/lib/importSheets.ts",
        "src/lib/seedDashboard.ts",
        "src/lib/sheets.ts",
        "src/lib/types.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});

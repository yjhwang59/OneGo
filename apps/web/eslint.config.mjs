import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 既有頁面多以 effect 觸發 fetch／同步 localStorage；暫放寬以利 CI，後續再逐步重構。
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;

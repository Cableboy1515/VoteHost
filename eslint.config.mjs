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
]);

// Demote over-strict React-Compiler advisory rules to warnings.
// These rules fire on intentional patterns (sync-from-props effects, "latest ref"
// trick, Date.now() in async Server Components) and were never enforced before CI.
// Genuine hook-order bugs remain errors via react-hooks/rules-of-hooks.
eslintConfig.push({
  rules: {
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/purity": "warn",
    "react-hooks/refs": "warn",
  },
})

export default eslintConfig;

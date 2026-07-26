// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.cjs", "**/*.mjs"] },
  ...tseslint.configs.recommended,
  {
    files: ["apps/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Scaffold-stage tuning: these are real, deliberate patterns used
    // throughout this codebase (dynamic import() for ESM-only deps, `any` at
    // narrow FFI-style boundaries like the ambient webtorrent declaration),
    // not sloppiness — see the inline comments at each site for why.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

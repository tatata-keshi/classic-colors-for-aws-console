import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "dist/"],
  },
  // 拡張機能本体。content script と popup はモジュールではなく
  // 素のスクリプトとして読み込まれる。
  {
    files: ["content.js", "popup.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-console": "error",
    },
  },
  // ビルド・検証スクリプト。こちらは Node の ESM。
  {
    files: ["tools/**/*.mjs", "eslint.config.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];

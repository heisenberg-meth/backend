import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import promisePlugin from "eslint-plugin-promise";

export default [
  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
    languageOptions: {
      ...(config.languageOptions || {}),
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),

  prettier,

  {
    files: ["**/*.{js,ts}"],

    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",

      globals: {
        ...globals.node,
      },
    },

    plugins: {
      promise: promisePlugin,
    },
  },

  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".git/**",
      "eslint.config.js",
    ],
  },
];
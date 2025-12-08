import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Code Style
      "arrow-body-style": ["error", "as-needed"],
      "arrow-parens": ["error", "always"],
      "arrow-spacing": "error",
      "block-spacing": ["error", "always"],
      "brace-style": ["error", "1tbs", { allowSingleLine: true }],
      "comma-dangle": ["error", "always-multiline"],
      "comma-spacing": "error",
      "comma-style": ["error", "last"],
      curly: ["error", "all"],
      "dot-notation": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      indent: ["error", 2, { SwitchCase: 1 }],
      "key-spacing": "error",
      "keyword-spacing": "error",
      "linebreak-style": ["error", "unix"],
      "max-len": ["error", { code: 100, ignoreUrls: true }],
      "new-parens": "error",
      "no-array-constructor": "error",
      "no-console": "off",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-extra-semi": "error",
      "no-floating-decimal": "error",
      "no-implicit-coercion": "error",
      "no-implied-eval": "error",
      "no-lone-blocks": "error",
      "no-multi-spaces": "error",
      "no-multiple-empty-lines": ["error", { max: 2, maxEOF: 0 }],
      "no-throw-literal": "error",
      "no-trailing-spaces": "error",
      "no-undef-init": "error",
      "no-unused-expressions": "error",
      "no-useless-concat": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      quotes: ["error", "single", { avoidEscape: true }],
      semi: ["error", "always"],
      "space-before-blocks": "error",
      "space-infix-ops": "error",

      // TypeScript specific
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    // Relaxed rules for test files
    files: ["**/*.test.{js,ts}", "**/test/**/*.{js,ts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "max-len": "off",
    },
  },
  {
    // Ignore patterns
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
    ],
  },
];

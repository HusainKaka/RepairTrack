import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: { ecmaVersion: 2022, globals: { window: "readonly", document: "readonly", localStorage: "readonly", navigator: "readonly", URL: "readonly", Blob: "readonly", crypto: "readonly" }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, "react-refresh/only-export-components": "off", "@typescript-eslint/unbound-method": "off", "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }], "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-unsafe-member-access": "off", "@typescript-eslint/no-unsafe-argument": "off", "@typescript-eslint/no-explicit-any": "off" }
  }
);

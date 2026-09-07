import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".devtools/**",
      "lib/generated/**",
      ".agents/**",
      ".windsurf/**",
      ".claude/**",
      "*.pid",
      "dump.rdb",
      "*.tsbuildinfo",
    ],
  },
  ...nextVitals,
];

export default eslintConfig;



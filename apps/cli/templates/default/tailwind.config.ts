import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@jiratown/client/dist/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        pixel: ["var(--font-pixel)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;

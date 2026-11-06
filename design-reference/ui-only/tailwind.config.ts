import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0e0f11", panel: "#151619", raised: "#1b1d21", line: "#25272c",
        ink: "#e8e9eb", muted: "#8a8e97", accent: "#7cc4b0", danger: "#e5786d", warn: "#d9b26a",
      },
      fontFamily: { sans: ["ui-sans-serif", "Inter", "system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"] },
      keyframes: { shimmer: { "100%": { transform: "translateX(100%)" } }, ping2: { "75%,100%": { transform: "scale(2.2)", opacity: "0" } } },
      animation: { shimmer: "shimmer 1.6s infinite", ping2: "ping2 1.8s cubic-bezier(0,0,.2,1) infinite" },
    },
  },
  plugins: [],
};
export default config;

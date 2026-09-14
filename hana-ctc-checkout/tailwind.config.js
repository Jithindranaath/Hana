/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("../packages/shared/tailwind-preset.js")],
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

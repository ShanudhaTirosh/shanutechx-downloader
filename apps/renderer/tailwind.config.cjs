/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@shanutechx/design-tokens/tailwind-preset.cjs")],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};

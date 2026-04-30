/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        income: { DEFAULT: "#16a34a", muted: "#dcfce7" },
        expense: { DEFAULT: "#dc2626", muted: "#fee2e2" },
        info: { DEFAULT: "#2563eb", muted: "#dbeafe" },
        warn: { DEFAULT: "#ca8a04", muted: "#fef9c3" },
      },
    },
  },
  plugins: [],
};

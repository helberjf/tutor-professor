import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#E0F2FE",
          DEFAULT: "#0EA5E9",
          dark: "#0369A1",
        },
        secondary: {
          light: "#FEF9C3",
          DEFAULT: "#EAB308",
          dark: "#A16207",
        },
        accent: {
          light: "#F0FDF4",
          DEFAULT: "#22C55E",
          dark: "#15803D",
        },
        kid: {
          pink: "#F472B6",
          purple: "#A78BFA",
          orange: "#FB923C",
          blue: "#60A5FA",
        }
      },
      borderRadius: {
        "kid": "1.5rem",
      }
    },
  },
  plugins: [],
};
export default config;

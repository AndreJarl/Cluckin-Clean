/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
   content: [
    "./app/**/*.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}", 
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "cta-green": "#6CD058",
        "cta-red": "#BF0C0F",
        "cta-yellow": "#DDA714",
      },
    },
  },
  plugins: [],
};

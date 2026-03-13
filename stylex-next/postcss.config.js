module.exports = {
  plugins: {
    "@stylexjs/postcss-plugin": {
      include: ["src/component/**/*.{js,jsx,ts,tsx}"],
      exclude: ["**/node_modules/**", "**/.next/**", "**/*.css"],
    },
  },
};

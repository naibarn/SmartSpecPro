import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  root: import.meta.dirname,
  test: {
    environment: "jsdom",
    include: ["tests/media-workspace/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
};

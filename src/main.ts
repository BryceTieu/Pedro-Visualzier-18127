import "./app.scss";
import App from "./App.svelte";
import { initAnalytics } from "./lib/analytics";

const app = new App({
  target: document.body!,
});

// Initialize Google Analytics (if VITE_GA_ID is provided)
initAnalytics();

export default app;

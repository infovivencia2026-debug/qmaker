import { defineConfig } from 'vitest/config';

// The rich-text code parses HTML with DOMParser, as it does in the app. Nothing is loaded from the network.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: { settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableJavaScriptEvaluation: true } },
    },
  },
});

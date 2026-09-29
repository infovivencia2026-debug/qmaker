import { defineConfig } from 'vitest/config';

// The rich-text code parses HTML with DOMParser, as it does in the app.
export default defineConfig({ test: { environment: 'happy-dom' } });

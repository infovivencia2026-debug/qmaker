import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import '@fontsource/noto-sans-telugu/400.css';
import '@fontsource/noto-sans-telugu/600.css';
import '@fontsource/noto-serif/400.css';
import '@fontsource/noto-serif/700.css';
import '@fontsource/noto-serif-devanagari/400.css';
import '@fontsource/noto-serif-devanagari/700.css';
import '@fontsource/noto-serif-telugu/400.css';
import '@fontsource/noto-serif-telugu/700.css';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/700.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import '@fontsource/tiro-devanagari-hindi/400.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/700.css';
import '@fontsource/hind/400.css';
import '@fontsource/hind/700.css';
import '@fontsource/tiro-telugu/400.css';
import '@fontsource/mandali/400.css';
import '@fontsource/ntr/400.css';
import '@fontsource/suranna/400.css';
import '@fontsource/noto-serif/400-italic.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { PAPER_CSS } from './lib/renderHtml';
import { StoreProvider } from './store';
import App from './App';

if (location.hash === '#print') {
  // Hidden window used by the main process for PDF export.
  document.body.className = 'print';
  window.__qmakerPrint = async (html) => {
    document.body.innerHTML = `<style>${PAPER_CSS}</style>${html}`;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await document.fonts.ready;
    return true;
  };
} else {
  createRoot(document.getElementById('root')!).render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

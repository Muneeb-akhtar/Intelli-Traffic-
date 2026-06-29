import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Bypass ngrok browser warning for all API fetch requests
const _fetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  if (url.includes('ngrok')) {
    init = { ...init, headers: { 'ngrok-skip-browser-warning': 'true', ...(init.headers as Record<string, string> ?? {}) } };
  }
  return _fetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

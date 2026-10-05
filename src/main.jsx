import React from 'react';
import ReactDOM from 'react-dom/client';
import { baozhengGoogleZitiYizai } from './utils/fonts.js';
import App from './App.jsx';
import { anzhuangQuanqiuCuowuBaogaoren, baogaoCuowu } from './errorReporter.js';
import './index.css';

anzhuangQuanqiuCuowuBaogaoren();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.warn('[PWA] Service Worker registration failed:', error);
    });
  });
}

// 这里先把这一步处理好，后面的逻辑就顺了。
async function kaishi() {
  const gen = document.getElementById('root');

  if (!gen) {
    throw new Error('找不到 #root 掛載節點');
  }

  try {
    baozhengGoogleZitiYizai('Inter:wght@900');
    baozhengGoogleZitiYizai('Noto+Sans+TC:wght@100..900');

    ReactDOM.createRoot(gen).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

  } catch (error) {
    await baogaoCuowu(error, 'BOOTSTRAP', 'APP_STARTUP_FAILURE');
  }
}

kaishi().catch(error => {
  baogaoCuowu(error, 'BOOTSTRAP', 'START_PROMISE_REJECTION');
});

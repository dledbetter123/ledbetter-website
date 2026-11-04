// src/index.js

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css'; // Global styles
import App from './App';
import { mountOverlay } from './portfolioOverlay';

// The site itself renders into #root. The static portfolio pages have no #root: they load
// this bundle only to open the LedbetterLM chat over the page (see portfolioOverlay.js).
const root = document.getElementById('root');
if (root) {
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    root,
  );
}
window.LedbetterLM = { mountOverlay };

// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/landing.css';
import './styles/app.css';

const host = document.getElementById('root');
if (!host) throw new Error('missing #root');
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

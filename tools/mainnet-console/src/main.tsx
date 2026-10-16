// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('no #root in the console page');

// Deliberately not StrictMode's double-invoked effects in development... except that this *is*
// development, and the one effect here only reads. Keeping StrictMode on catches the state bugs
// that a hand-driven, resumable flow is exactly the kind of thing to have.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

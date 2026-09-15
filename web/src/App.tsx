// SPDX-License-Identifier: Apache-2.0
//
// Routes. The landing page is the pitch; everything under `/app` drives one registry world, and
// `/proof` reads what the CLI actually deployed.
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from './routes/AppShell.js';
import { Landing } from './routes/Landing.js';
import { Ledger } from './routes/Ledger.js';
import { NotFound } from './routes/NotFound.js';
import { Persona } from './routes/Persona.js';
import { Proof } from './routes/Proof.js';
import { Replay } from './routes/Replay.js';
import { RegistryProvider } from './state/registry.js';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <RegistryProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/proof" element={<Proof />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="/app/replay" replace />} />
            <Route path="replay" element={<Replay />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path=":persona" element={<Persona />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </RegistryProvider>
    </BrowserRouter>
  );
}

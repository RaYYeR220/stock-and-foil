// SPDX-License-Identifier: Apache-2.0
//
// The shell every working route sits in: header, instrument rail, and the Network-mode panel when
// the visitor switches to it. The Sandbox is never blocked on Network mode being available.
import { Outlet } from 'react-router-dom';
import { Footer, Rail, Topbar } from '../components/chrome.js';
import { Busy } from '../components/ui.js';
import { NetworkPanel } from './NetworkPanel.js';
import { useRegistry } from '../state/registry.js';

export function AppShell() {
  const { status, error, mode } = useRegistry();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Topbar />
      <Rail />
      <main id="main" className="page">
        <div className="shell shell--wide">
          {mode === 'network' ? <NetworkPanel /> : null}
          {status === 'booting' ? (
            <Busy />
          ) : status === 'failed' ? (
            <div className="panel">
              <h3>The sandbox did not start</h3>
              <p>
                The compiled circuits could not be loaded in this browser. This needs WebAssembly and a recent browser
                engine.
              </p>
              <p className="mono">{error}</p>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

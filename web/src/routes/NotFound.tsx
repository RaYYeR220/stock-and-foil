// SPDX-License-Identifier: Apache-2.0
import { Link } from 'react-router-dom';
import { Footer, Topbar } from '../components/chrome.js';
import { SectionOpener, useTitle } from '../components/ui.js';

export function NotFound() {
  useTitle('Not found');
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Topbar cta={{ to: '/app/replay', label: 'Run the replay' }} />
      <main id="main" className="page">
        <div className="shell shell--wide">
          <SectionOpener
            title="No record here."
            level="h1"
            small
            dek="That address is not part of the registry. The guided replay is the place to start."
          />
          <p>
            <Link className="btn" to="/app/replay">
              Run the replay
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

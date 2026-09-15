// SPDX-License-Identifier: Apache-2.0
//
// Network mode. It enumerates whatever wallets the DApp Connector injected, checks for a proof
// server and for served proving keys, and connects to a deployed contract. When any of that is
// missing it says exactly which piece — and the Sandbox underneath keeps working regardless.
import { useEffect, useState } from 'react';
import { KeyValues, Outcome, Select } from '../components/ui.js';
import { DEPLOYMENTS } from '../lib/evidence.js';
import { listWallets, type WalletOption } from '../lib/wallets.js';
import { useRegistry, type ActionState } from '../state/registry.js';

const ZK_BASE = import.meta.env.VITE_ZK_BASE_URL ?? '/zk';

const NETWORK_OPTIONS = [
  { value: 'preprod', label: 'Preprod' },
  { value: 'preview', label: 'Preview' },
  { value: 'undeployed', label: 'Local devnet' },
];

export function NetworkPanel() {
  const { network, setNetwork, setMode } = useRegistry();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletKey, setWalletKey] = useState('');
  const [chain, setChain] = useState(DEPLOYMENTS[0]?.network ?? 'preprod');
  const [address, setAddress] = useState(DEPLOYMENTS[0]?.contractAddress ?? '');
  const [state, setState] = useState<ActionState>({ status: 'idle' });

  useEffect(() => {
    // Wallets inject themselves at load; give late ones a moment before deciding there are none.
    const scan = () => {
      const found = listWallets();
      setWallets(found);
      setWalletKey((key) => key || found[0]?.key || '');
    };
    scan();
    const handle = setTimeout(scan, 600);
    return () => clearTimeout(handle);
  }, []);

  useEffect(() => {
    const match = DEPLOYMENTS.find((d) => d.network === chain);
    if (match) setAddress(match.contractAddress);
  }, [chain]);

  const connect = async () => {
    setState({ status: 'running' });
    try {
      // The whole midnight-js stack — and a ten-megabyte ledger WebAssembly module — lives behind
      // this import, so a Sandbox visitor never downloads it.
      const { connectNetwork } = await import('../lib/network.js');
      const session = await connectNetwork({
        walletKey,
        network: chain as 'preprod' | 'preview' | 'undeployed',
        contractAddress: address.trim(),
        zkBaseUrl: ZK_BASE,
      });
      setNetwork(session);
      setState({ status: 'ok', message: `Connected to ${session.wallet.name} against ${session.backend.contractAddress}.` });
    } catch (cause) {
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Network mode could not start.',
      });
    }
  };

  return (
    <section className="panel" style={{ marginBottom: 'var(--s6)' }}>
      <h3>Network mode</h3>
      <p>
        Sandbox runs the same circuits with no chain behind them. Network mode needs three things that a static page
        cannot provide by itself: a Midnight wallet, a proof server it can reach, and a contract that has been deployed.
        Everything below reports honestly on what is present.
      </p>

      <KeyValues
        rows={[
          {
            label: 'Wallets injected',
            value: wallets.length ? wallets.map((w) => `${w.name}${w.apiVersion ? ` ${w.apiVersion}` : ''}`).join(', ') : 'none found',
          },
          {
            label: 'Deployments in this build',
            value: DEPLOYMENTS.length ? DEPLOYMENTS.map((d) => d.network).join(', ') : 'none — the CLI has not deployed yet',
          },
          { label: 'Proving keys served from', value: ZK_BASE, mono: true },
          {
            label: 'Currently connected',
            value: network ? `${network.wallet.name} · ${network.backend.contractAddress.slice(0, 20)}…` : 'no',
          },
        ]}
      />

      {wallets.length === 0 ? (
        <div className="outcome outcome--refused" role="status">
          <p>
            <strong>No Midnight wallet is injected into this page.</strong> Install one that supports the DApp Connector
            and reload. Nothing else on this site depends on it.
          </p>
        </div>
      ) : (
        <>
          <div className="row">
            <Select
              label="Wallet"
              value={walletKey}
              onChange={setWalletKey}
              options={wallets.map((w) => ({ value: w.key, label: `${w.name} (${w.key})` }))}
            />
            <Select label="Network" value={chain} onChange={setChain} options={NETWORK_OPTIONS} />
          </div>
          <label className="field">
            <span>Contract address</span>
            <input
              className="mono"
              value={address}
              spellCheck={false}
              placeholder="0200…"
              onChange={(e) => setAddress(e.target.value)}
            />
            <span className="hint">
              Filled from the deployment the CLI recorded, when there is one. Paste another to connect to it instead.
            </span>
          </label>
          <button
            className="btn"
            type="button"
            disabled={!walletKey || !address.trim() || state.status === 'running'}
            onClick={() => void connect()}
          >
            {state.status === 'running' ? 'Connecting…' : 'Connect the wallet'}
          </button>
        </>
      )}

      <Outcome state={state} />

      {network ? (
        <div className="row">
          <div className="actions">
            <button
              className="btn btn--sm btn--ghost"
              type="button"
              onClick={() => {
                setNetwork(null);
                setState({ status: 'idle' });
              }}
            >
              Disconnect
            </button>
          </div>
          <div className="actions">
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setMode('sandbox')}>
              Back to Sandbox
            </button>
          </div>
        </div>
      ) : null}

      <p className="hint">
        The replay, the explorer and the workspaces below always run on the Sandbox world. Connecting a wallet here does
        not move them onto the chain: a network run costs real proving time per circuit, and the CLI drives it end to
        end — see <a href="/proof">the proof page</a> for what it produced.
      </p>
    </section>
  );
}

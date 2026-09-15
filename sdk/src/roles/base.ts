// SPDX-License-Identifier: Apache-2.0
//
// Every role client is a persona plus a backend. Nothing below knows whether the backend runs
// in this process or on a Midnight network, which is what lets the CLI, the tests and the web
// app share one set of workflows.
import type { CallInputs, PublicLedgerView, RegistryBackend, StockAndFoilPrivateState, TxReceipt } from '../types.js';

export abstract class RoleClient {
  constructor(
    readonly backend: RegistryBackend,
    readonly persona: StockAndFoilPrivateState,
  ) {}

  get secretKey(): Uint8Array {
    return this.persona.secretKey;
  }

  /** Block time as the circuits will see it on the next call. */
  now(): Promise<bigint> {
    return this.backend.now();
  }

  /** Everything the chain reveals. */
  publicState(): Promise<PublicLedgerView> {
    return this.backend.publicState();
  }

  protected call(circuit: string, args: unknown[] = [], inputs?: CallInputs): Promise<TxReceipt> {
    return this.backend.call(this.persona, circuit, args, inputs);
  }
}

import { ethers } from 'ethers';
import * as io from 'io-ts';

import CellCollection from './cells/CellCollection';
import TransformCell from './cells/TransformCell';
import { ProviderConfig } from './background/ProviderConfig';
import { Preferences, Theme } from './background/Preferences';
import AsyncReturnType from './types/AsyncReturnType';
import { FormulaCell } from './cells/FormulaCell';
import assert from './helpers/assert';
import { QuillTransaction } from './types/Rpc';
import config from './config';
import optional from './types/optional';

// FIXME: If defaults were built into our io types, we could easily add new
// fields that always have concrete values incrementally without breaking
// existing clients.

function QuillStorageCells(storage: CellCollection) {
  const rootCells = {
    onboarding: storage.Cell(
      'onboarding',
      io.type({
        autoOpened: io.boolean,
        completed: io.boolean,
      }),
      () => ({
        autoOpened: false,
        completed: false,
      }),
    ),
    keyring: storage.Cell(
      'keyring',
      io.type({
        HDPhrase: io.string,
        nextHDIndex: io.number,
        wallets: io.array(
          io.type({
            privateKey: io.string,
            networks: io.record(
              io.string,
              optional(
                io.type({
                  originalGateway: io.string,
                  address: io.string,
                }),
              ),
            ),
          }),
        ),
      }),
      () => ({
        HDPhrase: ethers.Wallet.createRandom().mnemonic.phrase,
        nextHDIndex: 0,
        wallets: [],
      }),
    ),
    transactions: storage.Cell(
      'transactions',
      io.type({
        outgoing: io.array(QuillTransaction),
      }),
      () => ({ outgoing: [] }),
    ),
    network: storage.Cell('network', ProviderConfig, () => {
      const network = config.builtinNetworks[config.defaultNetwork];

      assert(
        network !== undefined,
        () => new Error('Missing config for default network'),
      );

      return network;
    }),
    preferences: storage.Cell('preferences', Preferences, () => ({
      identities: {},
      selectedAddress: undefined,
      developerSettings: {
        // For now, default to dev settings that are appropriate for the bls
        // wallet team. FIXME: The defaults that get bundled into the extension
        // should probably be configurable.
        breakOnAssertionFailures: true,
        exposeEthereumRpc: false,
        rpcLogging: {
          background: true,
          inPage: true,
        },
      },
    })),
  };

  const providerStateCells = {
    chainId: FormulaCell.Sub(rootCells.network, 'chainId'),
    selectedAddress: TransformCell.Sub(
      rootCells.preferences,
      'selectedAddress',
    ),
    developerSettings: TransformCell.Sub(
      rootCells.preferences,
      'developerSettings',
    ),
  };

  return {
    ...rootCells,
    providerState: new FormulaCell(
      providerStateCells,
      ({ $chainId, $developerSettings, $selectedAddress }) => ({
        chainId: $chainId,
        developerSettings: $developerSettings,
        selectedAddress: $selectedAddress,
      }),
    ),
    ...providerStateCells,

    theme: new FormulaCell(
      { preferences: rootCells.preferences },
      ({ $preferences: { selectedAddress, identities } }): Theme => {
        if (selectedAddress === undefined) {
          return 'light';
        }

        const identity = identities[selectedAddress];
        assert(identity !== undefined);

        return identity.theme;
      },
    ),

    breakOnAssertionFailures: TransformCell.Sub(
      providerStateCells.developerSettings,
      'breakOnAssertionFailures',
    ),

    exposeEthereumRpc: TransformCell.Sub(
      providerStateCells.developerSettings,
      'exposeEthereumRpc',
    ),
  };
}

type QuillStorageCells = ReturnType<typeof QuillStorageCells>;

export default QuillStorageCells;

export type QuillState<K extends keyof QuillStorageCells> = AsyncReturnType<
  QuillStorageCells[K]['read']
>;

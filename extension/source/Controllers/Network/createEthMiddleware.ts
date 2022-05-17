import {
  createAsyncMiddleware,
  createScaffoldMiddleware,
  JRPCMiddleware,
  JRPCRequest,
  JRPCResponse,
} from '@toruslabs/openlogin-jrpc';
import { BigNumberish, BytesLike } from 'ethers';
import { PROVIDER_JRPC_METHODS } from '../../common/constants';

export type SendTransactionParams = {
  from: string;
  to: string;
  gas?: BigNumberish;
  gasPrice?: BigNumberish;
  value?: BigNumberish;
  data: BytesLike;
};

export interface IProviderHandlers {
  version: string;
  getAccounts: (req: JRPCRequest<unknown>) => Promise<string[]>;
  requestAccounts: (req: JRPCRequest<unknown>) => Promise<string[]>;
  getProviderState: (
    req: JRPCRequest<unknown>,
  ) => Promise<{ accounts: string[]; chainId: string; isUnlocked: boolean }>;
  setPreferredAggregator: (req: JRPCRequest<unknown>) => Promise<string>;
  submitBatch: (req: JRPCRequest<SendTransactionParams>) => Promise<string>;
}

export function createWalletMiddleware({
  version,
  getAccounts,
  requestAccounts,
  getProviderState,
  setPreferredAggregator,
  submitBatch,
}: IProviderHandlers): JRPCMiddleware<string, unknown> {
  if (!getAccounts) {
    throw new Error('opts.getAccounts is required');
  }

  if (!requestAccounts) {
    throw new Error('opts.requestAccounts is required');
  }

  if (!getProviderStateFromController) {
    throw new Error('opts.getProviderState is required');
  }

  async function lookupAccounts(
    req: JRPCRequest<unknown>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    res.result = await getAccounts(req);
  }

  async function lookupDefaultAccount(
    req: JRPCRequest<unknown>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    const accounts = await getAccounts(req);
    res.result = accounts[0] || null;
  }

  async function requestAccountsFromProvider(
    req: JRPCRequest<unknown>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    res.result = await requestAccounts(req);
  }

  async function getProviderStateFromController(
    req: JRPCRequest<unknown>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    res.result = await getProviderState(req);
  }

  async function setPreferredAggregatorWrapper(
    req: JRPCRequest<SendTransactionParams>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    res.result = await setPreferredAggregator(req);
  }

  async function submitTransaction(
    req: JRPCRequest<SendTransactionParams>,
    res: JRPCResponse<unknown>,
  ): Promise<void> {
    res.result = await submitBatch(req);
  }

  return createScaffoldMiddleware({
    web3_clientVersion: `Quill/v${version}`,
    // account lookups
    eth_accounts: createAsyncMiddleware(lookupAccounts),
    eth_coinbase: createAsyncMiddleware(lookupDefaultAccount),
    eth_requestAccounts: createAsyncMiddleware(requestAccountsFromProvider),
    [PROVIDER_JRPC_METHODS.GET_PROVIDER_STATE]: createAsyncMiddleware(
      getProviderStateFromController,
    ),
    eth_setPreferredAggregator: createAsyncMiddleware<any, any>(
      setPreferredAggregatorWrapper,
    ),
    eth_sendTransaction: createAsyncMiddleware<any, any>(submitTransaction),
  });
}

import { ethers, UnsignedTransaction } from 'ethers';
import { createNanoEvents, Emitter } from 'nanoevents';
import { produce } from 'immer';
import { encrypt, decrypt } from '@metamask/browser-passworder';
import { notificationWindow } from 'src/background/NotificationWindow/NotificationWindow';
import { ChannelContext } from 'src/shared/types/ChannelContext';
import { PersistentStore } from 'src/shared/PersistentStore';
import {
  InvalidParams,
  OriginNotAllowed,
  UserRejected,
} from 'src/shared/errors/UserRejected';
import { INTERNAL_ORIGIN } from 'src/background/constants';
import type { WalletStoreState } from './persistence';
import {
  SeedType,
  createRecord,
  WalletContainer,
  MnemonicWalletContainer,
  PrivateKeyWalletContainer,
  BareWalletContainer,
} from './WalletRecord';
import type { WalletRecord } from './WalletRecord';
import { walletStore } from './persistence';
import { Store } from 'store-unit';
import { networksStore } from 'src/modules/networks/networks-store';
import { IncomingTransaction } from 'src/modules/ethereum/types/IncomingTransaction';
import { prepareTransaction } from 'src/modules/ethereum/transactions/prepareTransaction';

export interface BareWallet {
  mnemonic: ethers.Wallet['mnemonic'] | null;
  privateKey: ethers.Wallet['privateKey'];
  publicKey: ethers.Wallet['publicKey'];
  address: ethers.Wallet['address'];
}

function walletToObject(wallet: ethers.Wallet | BareWallet): BareWallet {
  return {
    mnemonic: wallet.mnemonic,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
    address: wallet.address,
  };
}

function toPlainObject(record: WalletRecord<BareWalletContainer>) {
  return {
    walletContainer: record.walletContainer
      ? {
          ...record.walletContainer,
          wallet: walletToObject(record.walletContainer.wallet),
        }
      : null,
    permissions: record.permissions,
  };
}

async function encryptRecord(
  key: string,
  record: WalletRecord<WalletContainer>
) {
  return encrypt(key, toPlainObject(record));
}

class RecordNotFound extends Error {}
class EncryptionKeyNotFound extends Error {}

type PublicMethodParams<T = undefined> = T extends undefined
  ? {
      context?: Partial<ChannelContext>;
    }
  : {
      params: T;
      context?: Partial<ChannelContext>;
    };

interface WalletEvents {
  recordUpdated: () => void;
  chainChanged: (chainId: string) => void;
}

export class Wallet {
  public id: string;
  private encryptionKey: string | null;
  private walletStore: PersistentStore<WalletStoreState>;
  private pendingWallet: WalletContainer | null = null;
  private record: WalletRecord<WalletContainer> | null;

  private store: Store<{ chainId: string }>;

  emitter: Emitter<WalletEvents>;

  constructor(id: string, encryptionKey: string | null) {
    this.store = new Store({ chainId: '0x1' });
    this.emitter = createNanoEvents();

    this.id = id;
    this.walletStore = walletStore;
    this.encryptionKey = encryptionKey;
    this.record = null;

    this.walletStore.ready().then(() => {
      this.syncWithWalletStore();
      this.walletStore.on('change', () => {
        this.syncWithWalletStore();
      });
    });
    Object.assign(window, { encrypt, decrypt });
  }

  private async syncWithWalletStore() {
    if (!this.encryptionKey) {
      return;
    }
    const record = walletStore.getState()[this.id];
    if (!record) {
      return;
    }
    const data = await decrypt<WalletRecord<BareWalletContainer>>(
      this.encryptionKey,
      record
    );
    if (data.walletContainer) {
      console.log('syncing with data:', data);
      const { seedType, wallet } = data.walletContainer;
      if (seedType === SeedType.mnemonic) {
        if (!wallet.mnemonic) {
          throw new Error(
            'Mnemonic container is expected to have a wallet with a mnemonic'
          );
        }
        this.record = {
          walletContainer: new MnemonicWalletContainer(wallet),
          permissions: data.permissions,
        };
      } else if (seedType === SeedType.privateKey) {
        this.record = {
          walletContainer: new PrivateKeyWalletContainer(wallet),
          permissions: data.permissions,
        };
      } else {
        throw new Error(`Unexpected SeedType: ${seedType}`);
      }
    } else {
      this.record = null;
    }
    this.emitter.emit('recordUpdated');
  }

  async ready() {
    return this.walletStore.ready();
  }

  async getId() {
    return this.id;
  }

  async updateId({ params: id }: PublicMethodParams<string>) {
    this.id = id;
    await walletStore.ready();
    await this.syncWithWalletStore();
  }

  async updateEncryptionKey({ params: key }: PublicMethodParams<string>) {
    this.encryptionKey = key;
    await walletStore.ready();
    await this.syncWithWalletStore();
  }

  async testMethod({ params: value }: PublicMethodParams<number>) {
    return new Promise<string>((r) => setTimeout(() => r(String(value)), 1500));
  }

  async generateMnemonic() {
    console.log('generateMnemonic', this.id, this);
    const wallet = ethers.Wallet.createRandom();
    this.pendingWallet = {
      seedType: SeedType.mnemonic,
      wallet,
    };
    return wallet;
  }

  async importPrivateKey({ params: privateKey }: PublicMethodParams<string>) {
    const wallet = new ethers.Wallet(privateKey);
    this.pendingWallet = {
      seedType: SeedType.privateKey,
      wallet,
    };
    return wallet;
  }

  async getCurrentWallet() {
    if (!this.id) {
      return null;
    }
    return this.record?.walletContainer?.wallet;
    // await this.walletStore.ready();
    // return this.getWalletFromStore();
  }

  async savePendingWallet() {
    if (!this.pendingWallet) {
      throw new Error('Cannot save pending wallet: pendingWallet is null');
    }
    if (!this.encryptionKey) {
      throw new Error('Cannot save pending wallet: encryptionKey is null');
    }
    const { seedType, wallet } = this.pendingWallet;
    const record = createRecord({ walletContainer: { seedType, wallet } });
    this.record = record;
    console.log('saving record', record);
    const encryptedRecord = await encryptRecord(this.encryptionKey, record);
    this.walletStore.setState((state) =>
      produce(state, (draft) => {
        draft[this.id] = encryptedRecord;
      })
    );
  }

  private async acceptOrigin(origin: string, address: string) {
    if (!this.encryptionKey) {
      throw new EncryptionKeyNotFound();
    }
    if (!this.record) {
      throw new RecordNotFound();
    }
    const updatedRecord = produce(this.record, (draft) => {
      draft.permissions[origin] = address;
    });
    const encryptedRecord = await encryptRecord(
      this.encryptionKey,
      updatedRecord
    );
    this.walletStore.setState((state) =>
      produce(state, (draft) => {
        draft[this.id] = encryptedRecord;
      })
    );
  }

  private allowedOrigin(
    context: Partial<ChannelContext> | undefined,
    address: string
  ): context is ChannelContext {
    if (!context || !context.origin) {
      throw new Error('This method requires context');
    }
    if (context.origin === INTERNAL_ORIGIN) {
      return true;
    }
    return this.record?.permissions[context.origin] === address;
  }

  async eth_accounts({ context }: PublicMethodParams) {
    if (!this.record) {
      return [];
    }
    const wallet = this.record?.walletContainer?.wallet;
    if (wallet && this.allowedOrigin(context, wallet.address)) {
      return wallet ? [wallet.address] : [];
    } else {
      return [];
    }
  }

  private getCurrentAddress() {
    return this.record?.walletContainer?.wallet.address;
  }

  async eth_requestAccounts({ context }: PublicMethodParams) {
    const currentAddress = this.getCurrentAddress();
    if (currentAddress && this.allowedOrigin(context, currentAddress)) {
      return [currentAddress];
    }
    if (!context?.origin) {
      throw new Error('This method requires origin');
    }
    // if (!this.wallet) {
    //   console.log('Must create wallet first');
    //   throw new Error('Must create wallet first');
    // }
    const { origin } = context;
    return new Promise((resolve, reject) => {
      notificationWindow.open({
        route: '/requestAccounts',
        search: `?origin=${origin}`,
        onResolve: (result) => {
          if (!this.record?.walletContainer) {
            throw new Error('Wallet not found');
          }
          this.acceptOrigin(origin, this.record.walletContainer.wallet.address);
          resolve(result);
        },
        onDismiss: () => {
          reject(new UserRejected('User Rejected the Request'));
        },
      });
    });
  }

  async wallet_switchEthereumChain({
    params,
    context,
  }: PublicMethodParams<[{ chainId: string | number }]>): Promise<string> {
    if (!this.record?.walletContainer) {
      throw new Error('Wallet is not initialized');
    }
    if (
      !this.allowedOrigin(context, this.record.walletContainer.wallet.address)
    ) {
      throw new OriginNotAllowed();
    }
    const { origin } = context;
    const { chainId } = params[0];
    return new Promise((resolve, reject) => {
      notificationWindow.open({
        route: '/switchEthereumChain',
        search: `?origin=${origin}&chainId=${chainId}`,
        onResolve: () => {
          const value = ethers.utils.hexValue(chainId);
          this.store.setState({ chainId: value });
          this.emitter.emit('chainChanged', value);
          resolve(value);
        },
        onDismiss: () => {
          reject(new UserRejected('User Rejected the Request'));
        },
      });
    });
  }

  private verifyInternalOrigin(context: Partial<ChannelContext> | undefined) {
    if (context?.origin !== INTERNAL_ORIGIN) {
      throw new OriginNotAllowed(context?.origin);
    }
  }

  async switchChain({ params: chain, context }: PublicMethodParams<string>) {
    if (context?.origin !== INTERNAL_ORIGIN) {
      // allow only for internal origin
      console.log({ INTERNAL_ORIGIN });
      throw new OriginNotAllowed(context?.origin);
    }
    const chains = {
      ethereum: '0x1',
      polygon: '0x89',
    };
    if (chain in chains) {
      const chainId = chains[chain as keyof typeof chains];
      this.store.setState({ chainId });
      this.emitter.emit('chainChanged', chainId);
    }
  }

  async getChainId() {
    return this.store.getState().chainId;
  }

  private async sendTransaction(
    incomingTransaction: IncomingTransaction,
    context: Partial<ChannelContext> | undefined
  ): Promise<ethers.providers.TransactionResponse> {
    this.verifyInternalOrigin(context);
    if (!this.record?.walletContainer) {
      throw new Error('Wallet is not initialized');
    }
    const { chainId } = this.store.getState();
    const targetChainId = ethers.utils.hexValue(
      incomingTransaction.chainId || '0x1'
    );
    if (chainId !== targetChainId) {
      await this.wallet_switchEthereumChain({
        params: [{ chainId: targetChainId }],
        context,
      });
      return this.sendTransaction(incomingTransaction, context);
    }
    const networks = await networksStore.load();
    const transaction = prepareTransaction(incomingTransaction);
    // const { chainId = '0x1' } = transaction;
    const nodeUrl = networks.getRpcUrlInternal(networks.getChainById(chainId));
    const jsonRpcProvider = new ethers.providers.JsonRpcProvider(nodeUrl);
    const signer = this.record.walletContainer.wallet.connect(jsonRpcProvider);
    // const populatedTransaction = await signer.populateTransaction({
    //   ...transaction,
    //   type: transaction.type || undefined,
    // });
    return signer.sendTransaction({
      ...transaction,
      type: transaction.type || undefined,
    });
    // return { signer, transaction, populatedTransaction, jsonRpcProvider };
  }

  async signAndSendTransaction({
    params,
    context,
  }: PublicMethodParams<IncomingTransaction[]>) {
    this.verifyInternalOrigin(context);
    const transaction = params[0];
    if (!transaction) {
      throw new InvalidParams();
    }
    return this.sendTransaction(transaction, context);
  }

  async eth_sendTransaction({
    params,
    context,
  }: PublicMethodParams<UnsignedTransaction[]>) {
    if (!this.record?.walletContainer) {
      throw new Error('Wallet is not initialized');
    }
    if (
      !this.allowedOrigin(context, this.record.walletContainer.wallet.address)
    ) {
      throw new OriginNotAllowed();
    }
    const transaction = params[0];
    if (!transaction) {
      throw new InvalidParams();
    }
    const { origin } = context;
    Object.assign(window, { transactionToSend: transaction });
    return new Promise((resolve, reject) => {
      notificationWindow.open({
        route: '/sendTransaction',
        search: `?origin=${origin}&transaction=${encodeURIComponent(
          JSON.stringify(transaction)
        )}`,
        onResolve: (hash) => {
          console.log('result', hash);
          resolve(hash);
        },
        onDismiss: () => {
          reject(new UserRejected('User Rejected the Request'));
        },
      });
    });
  }

  async logout() {
    chrome.storage.local.clear();
  }
}

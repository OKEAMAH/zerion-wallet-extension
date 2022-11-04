import React, { useMemo } from 'react';
import { useMutation, useQuery } from 'react-query';
import { DataStatus, useAssetsPrices } from 'defi-sdk';
import { useSearchParams } from 'react-router-dom';
import type { IncomingTransaction } from 'src/modules/ethereum/types/IncomingTransaction';
import { PageColumn } from 'src/ui/components/PageColumn';
import { PageTop } from 'src/ui/components/PageTop';
import { walletPort, windowPort } from 'src/ui/shared/channels';
import { Spacer } from 'src/ui/ui-kit/Spacer';
import { UIText } from 'src/ui/ui-kit/UIText';
import { VStack } from 'src/ui/ui-kit/VStack';
import { Button } from 'src/ui/ui-kit/Button';
import { Surface } from 'src/ui/ui-kit/Surface';
import { BlockieImg } from 'src/ui/components/BlockieImg';
import { Media } from 'src/ui/ui-kit/Media';
import { truncateAddress } from 'src/ui/shared/truncateAddress';
import { NetworkIndicator } from 'src/ui/components/NetworkIndicator';
import { useNetworks } from 'src/modules/networks/useNetworks';
import {
  describeTransaction,
  TransactionAction,
  TransactionDescription as TransactionDescriptionType,
} from 'src/modules/ethereum/transactions/describeTransaction';
import { baseToCommon } from 'src/shared/units/convert';
import { formatTokenValue } from 'src/shared/units/formatTokenValue';
import { Twinkle } from 'src/ui/ui-kit/Twinkle';
import ZerionSquircle from 'jsx:src/ui/assets/zerion-squircle.svg';
import { strings } from 'src/ui/transactions/strings';
import type { BareWallet } from 'src/shared/types/BareWallet';
import { Background } from 'src/ui/components/Background';
import { FillView } from 'src/ui/components/FillView';
import { capitalize } from 'capitalize-ts';
import { WarningIcon } from 'src/ui/components/WarningIcon';
import { PageStickyFooter } from 'src/ui/components/PageStickyFooter';
import { queryCacheForAsset } from 'src/modules/defi-sdk/queries';
import { Chain, createChain } from 'src/modules/networks/Chain';
import { fetchAndAssignGasPrice } from 'src/modules/ethereum/transactions/fetchAndAssignGasPrice';
import { hasGasPrice } from 'src/modules/ethereum/transactions/gasPrices/hasGasPrice';
import { NetworkFee } from './NetworkFee';
import { resolveChainForTx } from 'src/modules/ethereum/transactions/resolveChainForTx';
import { networksStore } from 'src/modules/networks/networks-store';
import { ErrorBoundary } from 'src/ui/components/ErrorBoundary';
import { invariant } from 'src/shared/invariant';
import { SiteFaviconImg } from 'src/ui/components/SiteFaviconImg';
import { PageFullBleedLine } from 'src/ui/components/PageFullBleedLine';
import { TextAnchor } from 'src/ui/ui-kit/TextAnchor';
import { HStack } from 'src/ui/ui-kit/HStack';
import { WalletIcon } from 'src/ui/ui-kit/WalletIcon';
import { WalletDisplayName } from 'src/ui/components/WalletDisplayName';
import { SurfaceList } from 'src/ui/ui-kit/SurfaceList';
import { AngleRightRow } from 'src/ui/components/AngleRightRow';
import { Networks } from 'src/modules/networks/Networks';

function UknownIcon({ size }: { size: number }) {
  return (
    <UIText
      kind="headline/h3"
      style={{
        height: size,
        width: size,
        lineHeight: `${size}px`,
        textAlign: 'center',
        fontWeight: 'normal',
        borderRadius: 6,
        backgroundColor: 'var(--neutral-300)',
        userSelect: 'none',
        color: 'var(--neutral-500)',
      }}
    >
      ?
    </UIText>
  );
}
function ItemSurface({ style, ...props }: React.HTMLProps<HTMLDivElement>) {
  const surfaceStyle = {
    ...style,
    padding: '10px 12px',
  };
  return <Surface style={surfaceStyle} {...props} />;
}

function WalletLine({ address, label }: { address: string; label: string }) {
  return (
    <ItemSurface>
      <Media
        vGap={0}
        image={<BlockieImg address={address} size={32} />}
        text={
          <UIText kind="caption/reg" color="var(--neutral-500)">
            {label}
          </UIText>
        }
        detailText={
          <UIText kind="subtitle/l_reg">{truncateAddress(address, 4)}</UIText>
        }
      />
    </ItemSurface>
  );
}

function AssetLine({
  transaction,
  networks,
  chain,
}: {
  transaction: TransactionDescriptionType;
  networks: Networks;
  chain: Chain;
}) {
  const assetCode =
    transaction.sendAssetId ||
    transaction.approveAssetCode ||
    transaction.sendAssetCode;
  const { value: assets, status } = useAssetsPrices(
    { currency: 'usd', asset_codes: [assetCode?.toLowerCase() || ''] },
    { enabled: Boolean(assetCode) }
  );
  const assetFromCache = useMemo(
    () => (assetCode ? queryCacheForAsset(assetCode) : null),
    [assetCode]
  );
  const asset = assetFromCache || (assetCode ? assets?.[assetCode] : null);
  if (
    status === DataStatus.ok &&
    !asset &&
    assetCode &&
    (transaction.action === TransactionAction.transfer ||
      transaction.action === TransactionAction.approve)
  ) {
    // Couldn't resolve asset for a send or approve transaction
    return (
      <SurfaceList
        items={[
          {
            key: 0,
            href: networks.getExplorerTokenUrlByName(chain, assetCode),
            target: '_blank',
            rel: 'noopener noreferrer',
            component: (
              <AngleRightRow>
                <Media
                  vGap={0}
                  image={null}
                  text={
                    <UIText kind="caption/reg" color="var(--neutral-500)">
                      Token
                    </UIText>
                  }
                  detailText={
                    <UIText kind="subtitle/l_reg" title={assetCode}>
                      {truncateAddress(assetCode, 6)}
                    </UIText>
                  }
                />
              </AngleRightRow>
            ),
          },
        ]}
      />
    );
  }
  if (!asset) {
    return status === DataStatus.requested ? (
      <ItemSurface style={{ height: 56 }} />
    ) : null;
  }
  if (transaction.action === TransactionAction.approve) {
    return (
      <SurfaceList
        items={[
          {
            key: 0,
            href: networks.getExplorerTokenUrlByName(chain, asset.asset_code),
            target: '_blank',
            rel: 'noopener noreferrer',
            component: (
              <AngleRightRow>
                <Media
                  vGap={0}
                  image={
                    <img
                      style={{ width: 32, height: 32, borderRadius: '50%' }}
                      src={asset.icon_url || ''}
                    />
                  }
                  text={
                    <UIText kind="caption/reg" color="var(--neutral-500)">
                      Token
                    </UIText>
                  }
                  detailText={
                    <UIText kind="subtitle/l_reg">
                      {asset.symbol || '...'}
                    </UIText>
                  }
                />
              </AngleRightRow>
            ),
          },
        ]}
      />
    );
  }
  if (transaction.action === TransactionAction.transfer) {
    return (
      <ItemSurface>
        <Media
          vGap={0}
          image={
            <img
              style={{ width: 32, height: 32, borderRadius: '50%' }}
              src={asset.icon_url || '...'}
            />
          }
          text={
            <UIText kind="caption/reg" color="var(--neutral-500)">
              Amount
            </UIText>
          }
          detailText={
            transaction.sendAmount == null ? null : (
              <UIText kind="subtitle/l_reg">
                {`${formatTokenValue(
                  baseToCommon(transaction.sendAmount, 18)
                )} ${asset.symbol}`}
              </UIText>
            )
          }
        />
      </ItemSurface>
    );
  }
  return null;
}

function TransactionDescription({
  transactionDescription,
  networks,
  chain,
}: {
  transactionDescription: TransactionDescriptionType;
  networks: Networks;
  chain: Chain;
}) {
  const { action, contractAddress, assetReceiver } = transactionDescription;
  return (
    <>
      <AssetLine
        transaction={transactionDescription}
        networks={networks}
        chain={chain}
      />
      {action === TransactionAction.transfer && assetReceiver ? (
        <WalletLine address={assetReceiver} label="Receiver" />
      ) : null}
      {action === TransactionAction.contractInteraction && contractAddress ? (
        <SurfaceList
          items={[
            {
              key: 0,
              // href: networks.getExplorerAddressUrlByName(chain, contractAddress),
              target: '_blank',
              rel: 'noopener noreferrer',
              component: (
                // <AngleRightRow>
                // </AngleRightRow>
                <Media
                  image={<UknownIcon size={32} />}
                  text={
                    <UIText kind="caption/reg" color="var(--neutral-500)">
                      Interact with
                    </UIText>
                  }
                  detailText={
                    <UIText kind="subtitle/l_reg" title="contractAddress">
                      {truncateAddress(contractAddress, 7)}
                    </UIText>
                  }
                />
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}

type SendTransactionError = null | Error | { body: string };
function errorToMessage(error?: SendTransactionError) {
  const fallbackString = 'Unknown Error';
  if (!error) {
    return fallbackString;
  }
  try {
    const result =
      'message' in error
        ? error.message
        : 'body' in error
        ? capitalize(JSON.parse(error.body).error.message) || fallbackString
        : fallbackString;
    return `Error: ${result}`;
  } catch (e) {
    return `Error: ${fallbackString}`;
  }
}

async function resolveChainAndGasPrice(
  transaction: IncomingTransaction,
  currentChain: Chain
) {
  const networks = await networksStore.load();
  const chain = await resolveChainForTx(transaction, currentChain);
  const chainId = networks.getChainId(chain);
  const copyWithChainId = { ...transaction, chainId };
  if (hasGasPrice(copyWithChainId)) {
    return copyWithChainId;
  } else {
    await fetchAndAssignGasPrice(copyWithChainId);
    return copyWithChainId;
  }
}

function SendTransactionContent({
  transactionStringified,
  origin,
  wallet,
}: {
  transactionStringified: string;
  origin: string;
  wallet: BareWallet;
}) {
  const [params] = useSearchParams();
  const incomingTransaction = useMemo(
    () => JSON.parse(transactionStringified) as IncomingTransaction,
    [transactionStringified]
  );
  const { networks } = useNetworks();
  const { data: transaction } = useQuery(
    ['resolveChainAndGasPrice', incomingTransaction, origin],
    async () => {
      const currentChain = await walletPort.request('requestChainForOrigin', {
        origin,
      });
      return resolveChainAndGasPrice(
        incomingTransaction,
        createChain(currentChain)
      );
    },
    { useErrorBoundary: true }
  );

  const descriptionQuery = useQuery(
    ['description', transaction],
    () => (transaction ? describeTransaction(transaction) : null),
    {
      retry: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    }
  );
  const { mutate: signAndSendTransaction, ...signMutation } = useMutation(
    async (transaction: IncomingTransaction) => {
      await new Promise((r) => setTimeout(r, 1000));
      return await walletPort.request('signAndSendTransaction', [
        transaction,
        { origin },
      ]);
    },
    {
      onSuccess: ({ hash }) => {
        const windowId = params.get('windowId');
        invariant(windowId, 'windowId get-parameter is required');
        windowPort.confirm(windowId, hash);
      },
    }
  );
  const hostname = useMemo(() => new URL(origin).hostname, [origin]);
  if (!transaction || descriptionQuery.isLoading || !networks) {
    return (
      <FillView>
        <Twinkle>
          <ZerionSquircle style={{ width: 64, height: 64 }} />
        </Twinkle>
      </FillView>
    );
  }
  if (descriptionQuery.isError || !descriptionQuery.data) {
    throw descriptionQuery.error || new Error('testing');
  }

  const chain = networks.getChainById(transaction.chainId);

  return (
    <Background backgroundKind="neutral">
      <PageColumn>
        <div
          style={{
            position: 'sticky',
            top: 0,
            backgroundColor: 'var(--background)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <NetworkIndicator chain={chain} networks={networks} />
          </div>
          <PageFullBleedLine lineColor="var(--neutral-300)" />
        </div>
        <PageTop />
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <SiteFaviconImg style={{ width: 44, height: 44 }} url={origin} />
          <Spacer height={16} />
          <UIText kind="headline/h2" style={{ textAlign: 'center' }}>
            {strings.actions[descriptionQuery.data.action] ||
              strings.actions[TransactionAction.contractInteraction]}
          </UIText>
          <UIText kind="subtitle/m_reg" color="var(--neutral-500)">
            <TextAnchor href={origin} target="_blank" rel="noopener noreferrer">
              {hostname}
            </TextAnchor>
          </UIText>
          <Spacer height={8} />

          <HStack gap={8} alignItems="center">
            <WalletIcon address={wallet.address} iconSize={20} active={false} />
            <UIText kind="small/regular">
              <WalletDisplayName wallet={wallet} />
            </UIText>
          </HStack>
        </div>
        {incomingTransaction.chainId == null ? (
          <>
            <Spacer height={24} />
            <Surface padding={12}>
              <Media
                alignItems="start"
                image={<WarningIcon glow={true} />}
                text={
                  <UIText kind="body/s_reg" color="var(--notice-500)">
                    {capitalize(hostname)} did not provide chainId
                  </UIText>
                }
                detailText={
                  <UIText kind="body/s_reg">
                    The transaction will be sent to{' '}
                    {networks?.getNetworkById(transaction.chainId)?.name}
                  </UIText>
                }
              />
            </Surface>
          </>
        ) : null}
        <Spacer height={24} />
        <VStack gap={16}>
          <VStack gap={12}>
            <TransactionDescription
              transactionDescription={descriptionQuery.data}
              networks={networks}
              chain={chain}
            />
          </VStack>
          {transaction && chain ? (
            <ErrorBoundary
              renderError={() => (
                <UIText kind="body/s_reg">
                  <span style={{ display: 'inline-block' }}>
                    <WarningIcon />
                  </span>{' '}
                  Failed to load network fee
                </UIText>
              )}
            >
              <SurfaceList
                items={[
                  {
                    key: 0,
                    component: (
                      <NetworkFee transaction={transaction} chain={chain} />
                    ),
                  },
                ]}
              />
            </ErrorBoundary>
          ) : null}
        </VStack>
        <Spacer height={16} />
      </PageColumn>
      <PageStickyFooter>
        <VStack
          style={{
            textAlign: 'center',
            paddingBottom: 32,
          }}
          gap={8}
        >
          <UIText kind="body/s_reg" color="var(--negative-500)">
            {signMutation.isError
              ? errorToMessage(signMutation.error as SendTransactionError)
              : null}
          </UIText>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <Button
              kind="regular"
              type="button"
              onClick={() => {
                const windowId = params.get('windowId');
                invariant(windowId, 'windowId get-parameter is required');
                windowPort.reject(windowId);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={signMutation.isLoading}
              onClick={() => {
                // send an untouched version of transaction;
                // TODO: if we add UI for updating gas price in this view,
                // we should send an updated tx object
                signAndSendTransaction(incomingTransaction);
              }}
            >
              {signMutation.isLoading
                ? 'Sending...'
                : descriptionQuery.data.action === TransactionAction.approve
                ? 'Approve'
                : 'Confirm'}
            </Button>
          </div>
        </VStack>
      </PageStickyFooter>
    </Background>
  );
}

export function SendTransaction() {
  const [params] = useSearchParams();
  const { data: wallet, isLoading } = useQuery(
    'wallet/uiGetCurrentWallet',
    () => walletPort.request('uiGetCurrentWallet'),
    { useErrorBoundary: true }
  );
  if (isLoading || !wallet) {
    return null;
  }
  const origin = params.get('origin');
  if (!origin) {
    throw new Error('origin get-parameter is required for this view');
  }
  const transactionStringified = params.get('transaction');
  if (!transactionStringified) {
    throw new Error('transaction get-parameter is required for this view');
  }
  return (
    <SendTransactionContent
      transactionStringified={transactionStringified}
      origin={origin}
      wallet={wallet}
    />
  );
}

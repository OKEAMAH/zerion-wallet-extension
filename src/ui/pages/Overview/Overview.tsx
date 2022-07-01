import React from 'react';
import { useMutation, useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { UIText } from 'src/ui/ui-kit/UIText';
import { PageColumn } from 'src/ui/components/PageColumn';
import { PageTop } from 'src/ui/components/PageTop';
import { accountPublicRPCPort, walletPort } from 'src/ui/shared/channels';
import { Spacer } from 'src/ui/ui-kit/Spacer';
import { Surface } from 'src/ui/ui-kit/Surface';
import { truncateAddress } from 'src/ui/shared/truncateAddress';
import { PageHeading } from 'src/ui/components/PageHeading';
import { BlockieImg } from 'src/ui/components/BlockieImg';
import { Background } from 'src/ui/components/Background';
import { UnstyledButton } from 'src/ui/ui-kit/UnstyledButton';
import { useNetworks } from 'src/modules/networks/useNetworks';
import { createChain } from 'src/modules/networks/Chain';
import { DataStatus, useAddressPortfolio } from 'defi-sdk';
import {
  formatCurrencyToParts,
  formatCurrencyValue,
} from 'src/shared/units/formatCurrencyValue';
import { formatPercent } from 'src/shared/units/formatPercent/formatPercent';

export function Overview() {
  const navigate = useNavigate();
  const {
    data: wallet,
    isLoading,
    isError,
  } = useQuery('wallet', () => {
    return walletPort.request('getCurrentWallet');
  });
  const logout = useMutation(() => accountPublicRPCPort.request('logout'));
  const { networks } = useNetworks();

  const { data: chainId, refetch: refetchChainId } = useQuery(
    'wallet/chainId',
    () => walletPort.request('getChainId')
  );

  const switchChainMutation = useMutation(
    (chain: string) => walletPort.request('switchChain', chain),
    { onSuccess: () => refetchChainId() }
  );
  const { value, status } = useAddressPortfolio({
    address: wallet?.address.toLowerCase() || '',
    currency: 'usd',
    portfolio_fields: 'all',
    use_portfolio_service: true,
  });
  console.log({ chainId, value });
  if (isError) {
    return <p>Some Error</p>;
  }
  if (isLoading || !wallet || status === DataStatus.requested) {
    return null;
  }
  return (
    <Background backgroundColor="var(--background)">
      <PageColumn>
        <div style={{ position: 'absolute', right: 8, top: 8 }}>
          {networks ? (
            <select
              name="chain"
              value={networks.getNetworkById(chainId || '0x1')?.chain ?? null}
              onChange={(event) => {
                switchChainMutation.mutate(event.target.value);
              }}
            >
              {networks?.getNetworks().map((network) => (
                <option key={network.chain} value={network.chain}>
                  {networks.getChainName(createChain(network.name))}
                </option>
              ))}
            </select>
          ) : null}
          <UIText
            kind="caption/reg"
            style={{
              overflow: 'hidden',
              maxWidth: 150,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {networks && chainId
              ? new URL(
                  networks.getRpcUrlInternal(networks.getChainById(chainId))
                ).hostname
              : null}
          </UIText>
        </div>
        <PageTop />
        <PageHeading>Summary</PageHeading>
        <Spacer height={24} />
        <Surface style={{ padding: 12 }}>
          <UIText kind="subtitle/l_reg">Portfolio</UIText>
          <UIText kind="h/1_med">
            {value?.total_value
              ? formatCurrencyToParts(value.total_value, 'en', 'usd').map(
                  (part) => (
                    <span
                      style={
                        part.type === 'decimal' || part.type === 'fraction'
                          ? { color: 'var(--neutral-300)' }
                          : undefined
                      }
                    >
                      {part.value}
                    </span>
                  )
                )
              : null}
          </UIText>
          {value?.relative_change_24h ? (
            <UIText kind="subtitle/l_reg" color="var(--positive-500)">
              {value?.relative_change_24h
                ? `+${formatPercent(value.relative_change_24h, 'en')}%`
                : ''}{' '}
              {value?.absolute_change_24h
                ? `(${formatCurrencyValue(
                    value?.absolute_change_24h,
                    'en',
                    'usd'
                  )})`
                : ''}{' '}
              Today
            </UIText>
          ) : null}
        </Surface>
        <Spacer height={8} />
        <Surface style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <BlockieImg address={wallet.address} size={44} />
            <div>
              <UIText kind="subtitle/l_reg" title={wallet.address}>
                {truncateAddress(wallet.address, 4)}
              </UIText>
              <UIText kind="h/6_med">
                $0<span style={{ color: 'var(--neutral-300)' }}>.00</span>
              </UIText>
            </div>
          </div>
        </Surface>
        <div
          style={{ marginTop: 'auto', paddingBottom: 16, textAlign: 'center' }}
        >
          <UnstyledButton
            onClick={async () => {
              await logout.mutateAsync();
              navigate('/login');
            }}
          >
            {logout.isLoading ? 'Locking...' : 'Lock (log out)'}
          </UnstyledButton>
        </div>
      </PageColumn>
    </Background>
  );
}

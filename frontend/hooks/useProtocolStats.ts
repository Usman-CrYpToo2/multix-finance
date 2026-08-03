import { useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { SOMNIA_CHAIN_ID } from '@/constants/chain';
import { useOraclePrices } from '@/hooks/useOraclePrices';

const cdpAbi = [
  { type: 'function', name: 'getTotalCollateral', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getTotalDebt', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const POOLS = [
  { pool: CONTRACT_ADDRESSES.GBP_POOL, priceKey: 'gbpUsdPrice' as const },
  { pool: CONTRACT_ADDRESSES.USD_Pool, priceKey: 'usdUsdPrice' as const },
];

/** Live protocol-wide TVL/minted totals, read straight from both CDPEngines - same
 * source of truth the Markets page uses, so the landing page never shows a stale
 * or made-up number. */
export function useProtocolStats() {
  const { ethUsdPrice, gbpUsdPrice, usdUsdPrice, isLoading: pricesLoading } = useOraclePrices();

  const { data, isLoading: readsLoading } = useReadContracts({
    contracts: POOLS.flatMap(({ pool }) => [
      { chainId: SOMNIA_CHAIN_ID, address: pool as `0x${string}`, abi: cdpAbi, functionName: 'getTotalCollateral' },
      { chainId: SOMNIA_CHAIN_ID, address: pool as `0x${string}`, abi: cdpAbi, functionName: 'getTotalDebt' },
    ]),
    query: { refetchInterval: 15000 },
  });

  const fiatPrices = { gbpUsdPrice, usdUsdPrice };

  let tvlUsd = 0;
  let mintedUsd = 0;
  POOLS.forEach(({ priceKey }, i) => {
    const rawCollateral = data?.[i * 2]?.result as bigint | undefined;
    const rawDebt = data?.[i * 2 + 1]?.result as bigint | undefined;
    tvlUsd += rawCollateral ? Number(formatEther(rawCollateral)) * ethUsdPrice : 0;
    mintedUsd += rawDebt ? Number(formatEther(rawDebt)) * fiatPrices[priceKey] : 0;
  });

  return {
    tvlUsd,
    mintedUsd,
    marketCount: POOLS.length,
    isLoading: pricesLoading || readsLoading,
  };
}

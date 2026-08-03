import { useReadContracts } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { SOMNIA_CHAIN_ID } from '@/constants/chain';

// Matches HybridFiatPriceFeed's fixed `decimals` constant (8).
const ORACLE_SCALE = 1e8;

const oracleAbi = [
  { type: 'function', name: 'ethUsdPrice', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'poolFxRates', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

/**
 * Reads live prices directly from HybridFiatPriceFeed instead of hardcoding them.
 * `poolFxRates[pool]` is the USD value of 1 unit of that pool's fiat stablecoin
 * (e.g. ~1.34 for GBP), matching what the contract's bot-push/AI-agent paths write.
 */
export function useOraclePrices() {
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { chainId: SOMNIA_CHAIN_ID, address: CONTRACT_ADDRESSES.ORACLE, abi: oracleAbi, functionName: 'ethUsdPrice' },
      { chainId: SOMNIA_CHAIN_ID, address: CONTRACT_ADDRESSES.ORACLE, abi: oracleAbi, functionName: 'poolFxRates', args: [CONTRACT_ADDRESSES.GBP_POOL] },
      { chainId: SOMNIA_CHAIN_ID, address: CONTRACT_ADDRESSES.ORACLE, abi: oracleAbi, functionName: 'poolFxRates', args: [CONTRACT_ADDRESSES.USD_Pool] },
    ],
    query: { refetchInterval: 15000 },
  });

  const rawEth = data?.[0]?.result as bigint | undefined;
  const rawGbp = data?.[1]?.result as bigint | undefined;
  const rawUsd = data?.[2]?.result as bigint | undefined;

  return {
    ethUsdPrice: rawEth ? Number(rawEth) / ORACLE_SCALE : 1000,
    gbpUsdPrice: rawGbp ? Number(rawGbp) / ORACLE_SCALE : 1.3,
    usdUsdPrice: rawUsd ? Number(rawUsd) / ORACLE_SCALE : 1.0,
    isLoading,
    refetchPrices: refetch,
  };
}

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { SOMNIA_CHAIN_ID } from '@/constants/chain';
import { Asset } from '@/types/market';
import { WithdrawModal } from '@/components/modals/WithdrawModal';
import { RepayModal } from '@/components/modals/RepayModal';
import { useOraclePrices } from '@/hooks/useOraclePrices';

// --- Configuration & ABIs ---
const cdpAbi = [
  { type: 'function', name: 'ltvConfig', stateMutability: 'view', inputs: [], outputs: [{ name: 'safeLtvBp', type: 'uint16' }, { name: 'liquidationLtvBp', type: 'uint16' }, { name: 'liquidationPenaltyBp', type: 'uint16' }] },
  { type: 'function', name: 'getTotalDebt', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getTotalCollateral', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }
] as const;

// The base config for the assets we want to load
const ASSET_CONFIG = [
  {
    id: 'gbp',
    name: 'British Pound Peg',
    symbol: 'GBP', // Change to GBP if you prefer
    color: 'bg-[#E6007A]',
    icon: '/icons/tokens/gbp.svg',
    poolAddress: CONTRACT_ADDRESSES.GBP_POOL,
    isCrossChain: true,
  },
  {
    id: 'usd',
    name: 'US Dollar Peg',
    symbol: 'USD',
    color: 'bg-blue-500',
    icon: '/icons/tokens/usd.svg',
    poolAddress: CONTRACT_ADDRESSES.USD_Pool,
    isCrossChain: true,
  },
  {
    id: 'eur',
    name: 'Euro Peg',
    symbol: 'EUR',
    color: 'bg-indigo-500',
    icon: '/icons/tokens/euro.svg',
    poolAddress: CONTRACT_ADDRESSES.EUR_POOL,
    isCrossChain: true,
  },
  {
    id: 'pkr',
    name: 'Pakistani Rupee Peg',
    symbol: 'PKR',
    color: 'bg-emerald-600',
    icon: '/icons/tokens/pkr.svg',
    poolAddress: CONTRACT_ADDRESSES.PKR_POOL,
    isCrossChain: true,
  }
];

export default function MarketsPage() {
  const router = useRouter();

  // Modal State
  const [activeModal, setActiveModal] = useState<'withdraw' | 'repay' | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // --- Blockchain Reads (Multicall) ---
  // We build an array of 3 contract calls for EVERY asset in our config
  const contracts = ASSET_CONFIG.flatMap(asset => [
    { chainId: SOMNIA_CHAIN_ID, address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getTotalCollateral' },
    { chainId: SOMNIA_CHAIN_ID, address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getTotalDebt' },
    { chainId: SOMNIA_CHAIN_ID, address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'ltvConfig' }
  ]);

  const { data: contractData } = useReadContracts({
    contracts,
    // Refetch every block to keep the UI perfectly live
    query: { refetchInterval: 3000 }
  });

  const { ethUsdPrice: COLLATERAL_PRICE, gbpUsdPrice, usdUsdPrice, eurUsdPrice, pkrUsdPrice } = useOraclePrices();
  const fiatPrices: Record<string, number> = { gbp: gbpUsdPrice, usd: usdUsdPrice, eur: eurUsdPrice, pkr: pkrUsdPrice };

  // --- Process Data ---
  const { liveAssets, totalVlUsd, totalMintedUsd } = useMemo(() => {
    let tvlSum = 0;
    let mintedSum = 0;
    const mappedAssets: Asset[] = [];


    for (let index = 0; index < ASSET_CONFIG.length; index++) {
      const config = ASSET_CONFIG[index];
      const baseIndex = index * 3;

      const rawCollateral = contractData?.[baseIndex]?.result as bigint | undefined;
      const rawDebt = contractData?.[baseIndex + 1]?.result as bigint | undefined;
      const rawLtv = contractData?.[baseIndex + 2]?.result as readonly [number, number, number] | undefined;

      const numCollateral = rawCollateral ? Number(formatEther(rawCollateral)) : 0;
      const numDebt = rawDebt ? Number(formatEther(rawDebt)) : 0;

      const fiatPrice = fiatPrices[config.id];
      const collateralUsd = numCollateral * COLLATERAL_PRICE;
      const debtUsd = numDebt * fiatPrice;

      // These mutations are now 100% safe because they are not inside a callback
      tvlSum += collateralUsd;
      mintedSum += debtUsd;

      mappedAssets.push({
        id: config.id,
        name: config.name,
        symbol: config.symbol,
        color: config.color,
        icon: config.icon,
        totalDeposited: numCollateral.toLocaleString(undefined, { maximumFractionDigits: 4 }),
        depositedUsd: `$${collateralUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        totalMinted: numDebt.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        mintedUsd: `$${debtUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        safeLtv: rawLtv ? `${(Number(rawLtv[0]) / 100).toFixed(2)}%` : '0.00%',
        maxLtv: rawLtv ? `${(Number(rawLtv[1]) / 100).toFixed(2)}%` : '0.00%',
        isCrossChain: config.isCrossChain,
        walletBalance: '0 WETH',
        supplyApy: '0.00%',
        debtAmount: '0.00',
      });
    }

    return { liveAssets: mappedAssets, totalVlUsd: tvlSum, totalMintedUsd: mintedSum };
  }, [contractData, COLLATERAL_PRICE, gbpUsdPrice, usdUsdPrice, eurUsdPrice, pkrUsdPrice]);

  const openModal = (type: 'withdraw' | 'repay', asset: Asset, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedAsset(asset);
    setActiveModal(type);
  };

  // Clicking anywhere else on an asset's row/card jumps to Borrow with that
  // stablecoin preselected, so users don't have to re-pick it themselves.
  const goToBorrow = (asset: Asset) => {
    router.push(`/borrow?asset=${asset.symbol}`);
  };

  const closeModal = () => {
    setActiveModal(null);
    setTimeout(() => setSelectedAsset(null), 200); 
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 font-sans">
      <div className="flex items-center gap-3 flex-wrap mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Markets</h1>
        <span className="bg-pink-500/10 text-pink-400 border border-pink-500/20 text-xs font-semibold px-2.5 py-1 rounded-full shadow-[0_0_8px_rgba(230,0,122,0.2)]">
          Somnia Testnet
        </span>
      </div>

      {/* Summary Cards Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
        {/* Dynamic TVL Card - full width on mobile since its number is the longest */}
        <div className="col-span-2 md:col-span-1 bg-black/40 backdrop-blur-md rounded-3xl sm:rounded-[2rem] p-5 sm:p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 text-center">
            <p className="text-zinc-400 text-xs sm:text-sm font-medium mb-2 tracking-wide">Total Value Locked (TVL)</p>
            <h2 className="text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 font-bold break-all">
              ${totalVlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 border border-white/5 rounded-full opacity-50"></div>
          <div className="absolute -right-4 -bottom-4 w-48 h-48 border border-white/10 rounded-full opacity-50"></div>
        </div>

        {/* Dynamic Minted Card */}
        <div className="bg-white/5 backdrop-blur-md rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center text-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-xs sm:text-sm font-medium mb-2">Total StableCoin Minted</p>
          <h2 className="text-2xl sm:text-4xl text-white font-bold break-all">
             ${totalMintedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h2>
        </div>

        {/* Static Auto-Rebalance Card */}
        <div className="bg-white/5 backdrop-blur-md rounded-3xl sm:rounded-[2rem] p-4 sm:p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center text-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-xs sm:text-sm font-medium mb-2">Total StableCoins</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-2xl sm:text-4xl text-white font-bold">{ASSET_CONFIG.length}</h2>
            <span className="text-emerald-400 text-xs sm:text-sm font-semibold drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">Active</span>
          </div>
        </div>
      </div>

      {/* Markets - mobile card list (the table below squeezes badly under ~768px) */}
      <div className="flex flex-col gap-4 md:hidden">
        {liveAssets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => goToBorrow(asset)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') goToBorrow(asset); }}
            className="bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl p-4 cursor-pointer hover:border-white/20 hover:bg-black/30 transition-colors"
          >
            {/* Asset header */}
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="w-9 h-9 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)] overflow-hidden shrink-0">
                <img src={asset.icon} alt={asset.symbol} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-base">{asset.name}</span>
                  {asset.isCrossChain && (
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-500/30 shrink-0">
                      Cross-Chain
                    </span>
                  )}
                </div>
                <span className="text-zinc-500 text-xs">{asset.symbol}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <div className="text-zinc-400 text-xs mb-1">Total Deposited</div>
                <div className="font-medium text-white text-sm">{asset.totalDeposited} WETH</div>
                <div className="text-zinc-400 text-xs">{asset.depositedUsd}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-xs mb-1">Total Minted (Debt)</div>
                <div className="font-medium text-white text-sm">{asset.totalMinted} {asset.symbol}</div>
                <div className="text-zinc-400 text-xs">{asset.mintedUsd}</div>
              </div>
            </div>

            {/* Liquidation params */}
            <div className="flex items-center gap-2 flex-wrap pb-4 border-b border-white/5">
              <span className="text-zinc-400 text-xs">Safe LTV:</span>
              <span className="font-medium text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-xs">{asset.safeLtv}</span>
              <span className="text-zinc-400 text-xs ml-2">Max LTV:</span>
              <span className="font-medium text-pink-300 bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.5 rounded text-xs">{asset.maxLtv}</span>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-4">
              <button
                onClick={(e) => openModal('withdraw', asset, e)}
                className="bg-white/10 hover:bg-white/20 active:bg-white/25 text-white border border-white/10 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Withdraw
              </button>
              <button
                onClick={(e) => openModal('repay', asset, e)}
                className="bg-pink-500/10 hover:bg-pink-500/20 active:bg-pink-500/25 text-pink-400 border border-pink-500/20 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Repay
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Markets Data Table (desktop) */}
      <div className="hidden md:block bg-black/20 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm text-left">
            <thead className="bg-white/5 text-zinc-400 font-medium border-b border-white/10">
              <tr>
                <th className="px-6 py-4 rounded-tl-3xl">Assets</th>
                <th className="px-6 py-4">Total Deposited</th>
                <th className="px-6 py-4">Total Minted (Debt)</th>
                <th className="px-6 py-4">Partial Liq. Parameters</th>
                <th className="px-6 py-4 text-right rounded-tr-3xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {liveAssets.map((asset) => (
                <tr
                  key={asset.id}
                  onClick={() => goToBorrow(asset)}
                  className="hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)] overflow-hidden">
                        <img src={asset.icon} alt={asset.symbol} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-base">{asset.name}</span>
                          {asset.isCrossChain && (
                            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-500/30">
                              Cross-Chain
                            </span>
                          )}
                        </div>
                        <span className="text-zinc-500 text-xs">{asset.symbol}</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="font-medium text-white">{asset.totalDeposited} WETH</div>
                    <div className="text-zinc-400 text-xs">{asset.depositedUsd}</div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="font-medium text-white">{asset.totalMinted} {asset.symbol}</div>
                    <div className="text-zinc-400 text-xs">{asset.mintedUsd}</div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between max-w-[140px]">
                        <span className="text-zinc-400 text-xs">Safe LTV:</span>
                        <span className="font-medium text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-xs">{asset.safeLtv}</span>
                      </div>
                      <div className="flex items-center justify-between max-w-[140px]">
                        <span className="text-zinc-400 text-xs">Max LTV:</span>
                        <span className="font-medium text-pink-300 bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.5 rounded text-xs">{asset.maxLtv}</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                      <div className="flex justify-end items-center gap-2">
                          <button
                              onClick={(e) => openModal('withdraw', asset, e)}
                              className="bg-white/10 hover:bg-white/20 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                              Withdraw
                          </button>
                          <button
                              onClick={(e) => openModal('repay', asset, e)}
                              className="bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                              Repay
                          </button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeModal === 'withdraw' && selectedAsset && (
        <WithdrawModal asset={selectedAsset} onClose={closeModal} />
      )}
      
      {activeModal === 'repay' && selectedAsset && (
        <RepayModal asset={selectedAsset} onClose={closeModal} />
      )}
    </div>
  );
}
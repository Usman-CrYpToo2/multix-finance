'use client';

import { useState, useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { Asset } from '@/types/market';
import { WithdrawModal } from '@/components/modals/WithdrawModal';
import { RepayModal } from '@/components/modals/RepayModal';

// --- Configuration & ABIs ---
const COLLATERAL_PRICE = 1000; // Still waiting for that Oracle function!

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
    poolAddress: CONTRACT_ADDRESSES.GBP_POOL,
    price: 1.30,
    isCrossChain: true,
  },
  {
    id: 'usd',
    name: 'US Dollar Peg',
    symbol: 'USD',
    color: 'bg-blue-500',
    poolAddress: CONTRACT_ADDRESSES.USD_Pool,
    price: 1.0,
    isCrossChain: false,
  }
];

export default function MarketsPage() {
  // Modal State
  const [activeModal, setActiveModal] = useState<'withdraw' | 'repay' | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // --- Blockchain Reads (Multicall) ---
  // We build an array of 3 contract calls for EVERY asset in our config
  const contracts = ASSET_CONFIG.flatMap(asset => [
    { address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getTotalCollateral' },
    { address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getTotalDebt' },
    { address: asset.poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'ltvConfig' }
  ]);

  const { data: contractData } = useReadContracts({ 
    contracts,
    // Refetch every block to keep the UI perfectly live
    query: { refetchInterval: 3000 } 
  });

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

      const collateralUsd = numCollateral * COLLATERAL_PRICE;
      const debtUsd = numDebt * config.price;

      // These mutations are now 100% safe because they are not inside a callback
      tvlSum += collateralUsd;
      mintedSum += debtUsd;

      mappedAssets.push({
        id: config.id,
        name: config.name,
        symbol: config.symbol,
        color: config.color,
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
  }, [contractData]);

  const openModal = (type: 'withdraw' | 'repay', asset: Asset) => {
    setSelectedAsset(asset);
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setTimeout(() => setSelectedAsset(null), 200); 
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 font-sans">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl font-bold text-white">Markets</h1>
        <span className="bg-pink-500/10 text-pink-400 border border-pink-500/20 text-xs font-semibold px-2.5 py-1 rounded-full shadow-[0_0_8px_rgba(230,0,122,0.2)]">
          Polkadot Hub Testnet
        </span>
      </div>

      {/* Summary Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Dynamic TVL Card */}
        <div className="bg-black/40 backdrop-blur-md rounded-[2rem] p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-2 tracking-wide">Total Value Locked (TVL)</p>
            <h2 className="text-4xl text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 font-bold">
              ${totalVlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h2>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 border border-white/5 rounded-full opacity-50"></div>
          <div className="absolute -right-4 -bottom-4 w-48 h-48 border border-white/10 rounded-full opacity-50"></div>
        </div>

        {/* Dynamic Minted Card */}
        <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-sm font-medium mb-2">Total StableCoin Minted</p>
          <h2 className="text-4xl text-white font-bold">
             ${totalMintedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h2>
        </div>

        {/* Static Auto-Rebalance Card */}
        <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-sm font-medium mb-2">Total StableCoins</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl text-white font-bold">{ASSET_CONFIG.length}</h2>
            <span className="text-emerald-400 text-sm font-semibold drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">Active</span>
          </div>
        </div>
      </div>

      {/* Markets Data Table */}
      <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
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
                <tr key={asset.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${asset.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-[0_0_10px_rgba(255,255,255,0.2)]`}>
                        {asset.symbol.charAt(0)}
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
                              onClick={() => openModal('withdraw', asset)}
                              className="bg-white/10 hover:bg-white/20 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                              Withdraw
                          </button>
                          <button
                              onClick={() => openModal('repay', asset)}
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
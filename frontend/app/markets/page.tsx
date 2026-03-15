'use client';

import Link from 'next/link';

const MarketsPage = () => {
  // Mock data for the markets table
  const marketAssets = [
    {
      id: 'dot',
      name: 'Polkadot',
      symbol: 'DOT',
      color: 'bg-[#E6007A]', // Polkadot true brand color
      totalDeposited: '1.25M',
      depositedUsd: '$12.5M',
      totalMinted: '5.2M',
      mintedUsd: '$5.2M',
      safeLtv: '70.00%',
      maxLtv: '80.00%',
      isCrossChain: true,
    },
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      color: 'bg-indigo-500',
      totalDeposited: '4,250',
      depositedUsd: '$12.7M',
      totalMinted: '6.1M',
      mintedUsd: '$6.1M',
      safeLtv: '75.00%',
      maxLtv: '82.50%',
      isCrossChain: true,
    },
    {
      id: 'usdc',
      name: 'USD Coin',
      symbol: 'USDC',
      color: 'bg-blue-500',
      totalDeposited: '8.5M',
      depositedUsd: '$8.5M',
      totalMinted: '7.6M',
      mintedUsd: '$7.6M',
      safeLtv: '90.00%',
      maxLtv: '95.00%',
      isCrossChain: false,
    }
  ];

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
        {/* Dark Hero Card */}
        <div className="bg-black/40 backdrop-blur-md rounded-[2rem] p-8 relative overflow-hidden shadow-2xl border border-white/10 group">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10 text-center">
            <p className="text-zinc-400 text-sm font-medium mb-2 tracking-wide">Total Value Locked (Cross-Chain)</p>
            <h2 className="text-4xl text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400 font-bold">$33.7M</h2>
          </div>
          
          <div className="absolute -right-12 -bottom-12 w-48 h-48 border border-white/5 rounded-full opacity-50"></div>
          <div className="absolute -right-4 -bottom-4 w-48 h-48 border border-white/10 rounded-full opacity-50"></div>
        </div>

        {/* Light Stat Cards (Converted to Dark) */}
        <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-sm font-medium mb-2">Total StableCoin Minted</p>
          <h2 className="text-4xl text-white font-bold">$18.9M</h2>
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-[2rem] p-8 border border-white/10 shadow-lg flex flex-col justify-center items-center hover:bg-white/10 transition-colors">
          <p className="text-zinc-400 text-sm font-medium mb-2">Vaults Protected (Auto-Rebalance)</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl text-white font-bold">1,204</h2>
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
                <th className="px-6 py-4 text-right rounded-tr-3xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {marketAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-white/5 transition-colors group">
                  {/* Asset Column */}
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

                  {/* Deposited Column */}
                  <td className="px-6 py-5">
                    <div className="font-medium text-white">{asset.totalDeposited}</div>
                    <div className="text-zinc-400 text-xs">{asset.depositedUsd}</div>
                  </td>

                  {/* Minted Column */}
                  <td className="px-6 py-5">
                    <div className="font-medium text-white">{asset.totalMinted}</div>
                    <div className="text-zinc-400 text-xs">{asset.mintedUsd}</div>
                  </td>

                  {/* Protocol Parameters Column (Your Secret Sauce) */}
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

                  {/* Action Column */}
                  <td className="px-6 py-5 text-right">
                      <Link
                          href="/borrow"
                          className="inline-block bg-white/10 hover:bg-pink-600/90 text-white border border-white/10 hover:border-pink-500/50 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:shadow-[0_0_15px_rgba(230,0,122,0.4)]"
                      >
                          Manage Vault
                      </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarketsPage;
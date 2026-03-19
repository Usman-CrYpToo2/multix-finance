'use client';

import React from 'react';
import { useVaultData } from '@/hooks/useVaultData';

export default function EasyBorrowCard() {
  const {
    depositAmount, borrowAmount, formattedBalance, totalCollateralValue, totalDebtValue,
    currentLTV, SAFE_LTV, MAX_LTV, currentHF, hfStatusText, maxBorrowableSPK,
    isExceedingBalance, buttonText, buttonAction, buttonDisabled,
    isConfirmed, txType, handleMaxClick, handleDepositChange, handleMaxBorrowClick, handleBorrowChange,

    SUPPORTED_ASSETS, selectedAssetId, setSelectedAssetId, activeAsset, borrowAPR,
    existingCollateral, existingDebt, existingCollateralValue, existingDebtValue
  } = useVaultData();

  const getProgressColor = (ltv: number) => {
    if (ltv >= MAX_LTV) return 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]';
    if (ltv >= SAFE_LTV) return 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]';
    if (ltv >= 40) return 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]';
    return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]';
  };

  const getStatusClasses = (status: string) => {
    if (status === 'Safe') return 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
    if (status === 'Moderate') return 'bg-[#facc15]/20 text-[#facc15] shadow-[0_0_10px_rgba(250,204,21,0.2)]';
    return 'bg-pink-500/20 text-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.2)]';
  };

  return (
    <div className="max-w-6xl mx-auto font-sans grid grid-cols-1 lg:grid-cols-3 gap-6">

      <div className="lg:col-span-2 p-6 md:p-8 bg-black/20 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

        <div className="flex flex-col md:flex-row gap-4 mb-8 relative z-10">

          {/* Deposit Box */}
          <div className={`flex-1 border rounded-2xl flex flex-col overflow-hidden transition-colors ${isExceedingBalance ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
            <div className="p-5">
              <div className="flex justify-between text-sm mb-3 text-zinc-400">
                <span className={isExceedingBalance ? 'text-pink-400' : ''}>Deposit Collateral</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">
                    Balance: {Number(formattedBalance).toFixed(4)} WETH
                  </span>
                  <button onClick={handleMaxClick} className="text-pink-400 hover:text-pink-300 font-medium transition-colors">Max</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 shadow-inner">
                  <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs shadow-[0_0_8px_rgba(99,102,241,0.5)]">Ξ</div>
                  <span className="font-semibold text-white">ETH</span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <input
                    type="text"
                    value={depositAmount}
                    onChange={handleDepositChange}
                    placeholder="0.00"
                    className={`w-32 text-right bg-transparent text-3xl font-bold focus:outline-none placeholder:text-zinc-600 transition-colors ${isExceedingBalance ? 'text-pink-500' : 'text-white'}`}
                  />
                  <div className="text-sm mt-1 flex flex-col items-end">
                    <span className="text-zinc-500">${totalCollateralValue.toLocaleString()}</span>
                    {isExceedingBalance && <span className="text-pink-500 font-medium text-xs mt-1 animate-pulse">Exceeds your balance</span>}
                  </div>
                </div>
              </div>
            </div>


            <div className="bg-black/30 px-5 py-3 border-t border-white/5 flex items-center gap-2 text-xs text-zinc-400">
              <div className="w-4 h-4 bg-indigo-500/20 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              </div>
              Already deposited ~${existingCollateralValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} WETH
            </div>
          </div>

          {/* Borrow Box */}
          <div className="flex-1 border border-white/10 rounded-2xl flex flex-col overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
            <div className="p-5">
              <div className="flex justify-between text-sm mb-3 text-zinc-400">
                <span>Borrow</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">
                    Limit: {maxBorrowableSPK.toFixed(2)} {activeAsset.symbol}
                  </span>
                  <button onClick={handleMaxBorrowClick} className="text-[#E6007A] hover:text-pink-400 font-medium transition-colors">Max</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-black/40 pl-2 pr-3 py-1.5 rounded-full border border-white/10 shadow-inner hover:border-white/30 transition-colors">
                  <div className="w-6 h-6 bg-[#E6007A] rounded-full flex items-center justify-center text-white text-xs shadow-[0_0_8px_rgba(230,0,122,0.5)]">$</div>
                  <select
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value as keyof typeof SUPPORTED_ASSETS)}
                    className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer appearance-none pr-4"
                    style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '16px' }}
                  >
                    {Object.entries(SUPPORTED_ASSETS).map(([key, asset]) => (
                      <option key={key} value={key} className="bg-zinc-900 text-white">
                        {asset.symbol} ({key})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-right flex flex-col items-end">
                  <input
                    type="text"
                    value={borrowAmount}
                    onChange={handleBorrowChange}
                    placeholder="0.00"
                    className="w-32 text-right bg-transparent text-3xl font-bold text-white focus:outline-none placeholder:text-zinc-600"
                  />
                  <div className="text-sm text-zinc-500 mt-1">${totalDebtValue.toLocaleString()}</div>
                </div>
              </div>
            </div>

            
            <div className="bg-black/30 px-5 py-3 border-t border-white/5 flex items-center gap-2 text-xs text-zinc-400">
              <div className="w-4 h-4 bg-[#E6007A]/20 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-[#E6007A] rounded-full"></div>
              </div>
              Already borrowed ~${existingDebtValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeAsset.symbol}
            </div>
          </div>
        </div>

        {/* LTV Visualizer Section */}
        <div className="border border-white/10 rounded-2xl p-6 bg-black/40 shadow-inner mb-8 relative overflow-hidden z-10">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="font-semibold text-white text-lg">Loan to Value (LTV)</h3>
              <p className="text-xs text-zinc-400 mt-1">Ratio of the collateral value to the borrowed value</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${currentLTV >= MAX_LTV ? 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'text-white'}`}>
                {currentLTV.toFixed(2)}%
              </div>
              <div className="text-xs text-zinc-500 mt-1">max. {MAX_LTV.toFixed(2)}%</div>
            </div>
          </div>

          <div className="relative h-3 bg-zinc-800/80 rounded-full mb-8 overflow-visible">
            <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${getProgressColor(currentLTV)}`} style={{ width: `${Math.min(currentLTV, 100)}%` }}></div>

            <div className="absolute top-0 h-full border-l-2 border-indigo-400 z-10" style={{ left: `${SAFE_LTV}%` }}>
              <div className="absolute -top-7 -left-8 text-[10px] font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded shadow-sm whitespace-nowrap backdrop-blur-md">
                Safe LTV ({SAFE_LTV}%)
              </div>
            </div>

            <div className="absolute top-0 h-full border-l-2 border-pink-500 z-10 shadow-[0_0_5px_rgba(236,72,153,0.8)]" style={{ left: `${MAX_LTV}%` }}>
              <div className="absolute top-5 -left-6 text-[10px] font-bold text-pink-300 bg-pink-500/20 border border-pink-500/30 px-2 py-0.5 rounded whitespace-nowrap backdrop-blur-md">
                Liquidation ({MAX_LTV}%)
              </div>
            </div>
          </div>

          {currentLTV >= MAX_LTV && (
            <div className="mt-2 p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl text-sm text-pink-200 animate-pulse backdrop-blur-md shadow-[0_0_15px_rgba(236,72,153,0.15)]">
              <strong className="text-pink-400">🚨 Liquidation Risk:</strong> Your current inputs exceed the maximum allowed LTV.
            </div>
          )}
        </div>

        {/*Health Factor Card*/}
        <div className="border border-white/10 rounded-2xl p-8 bg-black/40 shadow-inner mb-8 relative overflow-hidden z-10 font-sans">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-xl">Health factor</h3>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-zinc-500 hover:text-white transition-colors cursor-help">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.835a.05.05 0 0 0 .041.063h.041a.75.75 0 0 1 .632.964l-1.068 3.56a1.5 1.5 0 0 1-1.071 1.072zM12.75 9a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="text-right">
              <div className={`inline-block font-bold text-xs px-3 py-1 rounded-full ${getStatusClasses(hfStatusText)}`}>
                {hfStatusText}
              </div>
            </div>
          </div>

          <div className="text-center text-7xl font-bold text-white mb-6">
            {Number(currentHF || 0).toFixed(2)}
          </div>

          <div className="relative mb-8 pt-6 pb-4 px-2">
            <div className="h-4 w-full bg-zinc-800/80 rounded-full flex gap-1 border border-white/5 shadow-inner">
              <div className="flex-1 bg-pink-500/20 rounded-l-full relative group">
                <span className="absolute -top-6 left-2 text-[10px] text-pink-400 font-medium group-hover:opacity-100 opacity-60">Alert</span>
              </div>
              <div className="flex-1 bg-[#facc15]/20 relative group">
                <span className="absolute -top-6 left-2 text-[10px] text-[#facc15] font-medium group-hover:opacity-100 opacity-60">Moderate</span>
              </div>
              <div className="flex-1 bg-emerald-500/20 rounded-r-full relative group">
                <span className="absolute -top-6 left-2 text-[10px] text-emerald-400 font-medium group-hover:opacity-100 opacity-60">Safe</span>
              </div>
            </div>

            <div className="absolute top-[2px] h-full border-l-[3px] border-white/80 z-20 shadow-[0_0_8px_white]" style={{ left: `${Math.min(((currentHF - 1) / 4) * 100, 100)}%` }}>
              <div className="absolute -top-3 -left-[6.5px] w-0 h-0 border-l-[6.5px] border-r-[6.5px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/80"></div>
            </div>

            <div className="absolute bottom-[-10px] w-full flex justify-between text-[11px] font-medium text-zinc-500 px-1">
              <span>1.0</span><span>1.5</span><span>2.0</span><span>2.5</span><span>3.0</span><span>3.5</span><span>4.0</span><span>4.5</span><span>5+</span>
            </div>
          </div>
        </div>

        {/*\THE ACTION BUTTON */}
        <button
          onClick={buttonAction}
          disabled={buttonDisabled}
          className={`w-full py-5 rounded-2xl font-bold text-xl transition-all duration-300 relative z-10 overflow-hidden ${buttonDisabled
            ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed border border-white/5'
            : 'bg-[#E6007A] hover:bg-pink-500 text-white shadow-[0_0_20px_rgba(230,0,122,0.4)] hover:shadow-[0_0_30px_rgba(236,72,153,0.6)]'
            }`}
        >
          {buttonText}
        </button>

        {isConfirmed && txType === 'none' && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
            Transaction successfully confirmed on-chain!
          </div>
        )}
      </div>

      <div className="lg:col-span-1 flex flex-col gap-6">

        {/* Dynamic Borrow Rate Box */}
        <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-center h-[180px]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-[#E6007A] rounded-full flex items-center justify-center text-white text-xs font-bold shadow-[0_0_8px_rgba(230,0,122,0.5)]">
              $
            </div>
            <span className="text-zinc-300 font-medium text-sm tracking-wide">Borrow Rate</span>
          </div>
          <div className="text-5xl font-bold text-[#ffffff] drop-shadow-[0_0_15px_rgba(250,204,21,0.2)]">
            {borrowAPR.toFixed(2)}%
          </div>
          {/* <div className="text-xs text-zinc-500 mt-2">
            Live {activeAsset.symbol} pool API rate
          </div> */}
        </div>

      </div>

    </div>
  );
}
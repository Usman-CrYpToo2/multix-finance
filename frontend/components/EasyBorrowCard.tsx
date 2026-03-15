'use client';

import React, { useState } from 'react';

const EasyBorrowCard = () => {
  // Mock prices for the UI
  const COLLATERAL_PRICE = 3000; // e.g., $3000 per ETH
  const STABLECOIN_PRICE = 1; // $1 per StableCoin

  // State
  const [depositAmount, setDepositAmount] = useState(1);
  const [borrowAmount, setBorrowAmount] = useState(1000);
  const [autoRebalance, setAutoRebalance] = useState(false);

  const collateralValue = depositAmount * COLLATERAL_PRICE;
  const borrowValue = borrowAmount * STABLECOIN_PRICE;
  const currentLTV = collateralValue > 0 ? (borrowValue / collateralValue) * 100 : 0;

  // Protocol Constants
  const SAFE_LTV = 70.0;
  const MAX_LTV = 82.5;

  // Dynamic Progress Bar 
  const getProgressColor = (ltv: number) => {
    if (ltv >= MAX_LTV) return 'bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]';
    if (ltv >= SAFE_LTV) return 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]';
    if (ltv >= 40) return 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]';
    return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]';
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 bg-black/20 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 font-sans relative overflow-hidden group">
      
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

      {/* Input Section */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 relative z-10">
        
        {/* Deposit Box */}
        <div className="flex-1 border border-white/10 rounded-2xl p-5 bg-white/5 hover:bg-white/10 transition-colors">
          <div className="flex justify-between text-sm mb-3 text-zinc-400">
            <span>Deposit Collateral</span>
            <button className="text-pink-400 hover:text-pink-300 font-medium transition-colors">Max</button>
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
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-32 text-right bg-transparent text-3xl font-bold text-white focus:outline-none no-arrows"
              />
              <div className="text-sm text-zinc-500 mt-1">${collateralValue.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Borrow Box */}
        <div className="flex-1 border border-white/10 rounded-2xl p-5 bg-white/5 hover:bg-white/10 transition-colors">
          <div className="flex justify-between text-sm mb-3 text-zinc-400">
            <span>Borrow</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 shadow-inner">
              <div className="w-6 h-6 bg-[#E6007A] rounded-full flex items-center justify-center text-white text-xs shadow-[0_0_8px_rgba(230,0,122,0.5)]">$</div>
              <span className="font-semibold text-white">SPK</span>
            </div>
            <div className="text-right flex flex-col items-end">
              <input
                type="text"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(Number(e.target.value))}
                className="w-32 text-right bg-transparent text-3xl font-bold text-white focus:outline-none no-arrows"
              />
              <div className="text-sm text-zinc-500 mt-1">${borrowValue.toLocaleString()}</div>
            </div>
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

        {/* Progress Bar Container */}
        <div className="relative h-3 bg-zinc-800/80 rounded-full mb-8 overflow-visible">
          {/* Active Fill */}
          <div 
            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${getProgressColor(currentLTV)}`}
            style={{ width: `${Math.min(currentLTV, 100)}%` }}
          ></div>

          {/* Safe LTV Marker */}
          <div 
            className="absolute top-0 h-full border-l-2 border-indigo-400 z-10"
            style={{ left: `${SAFE_LTV}%` }}
          >
            <div className="absolute -top-7 -left-8 text-[10px] font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded shadow-sm whitespace-nowrap backdrop-blur-md">
              Safe LTV ({SAFE_LTV}%)
            </div>
          </div>

          {/* Liquidation Marker */}
          <div 
            className="absolute top-0 h-full border-l-2 border-pink-500 z-10 shadow-[0_0_5px_rgba(236,72,153,0.8)]"
            style={{ left: `${MAX_LTV}%` }}
          >
            <div className="absolute -top-7 -left-6 text-[10px] font-bold text-pink-300 bg-pink-500/20 border border-pink-500/30 px-2 py-0.5 rounded whitespace-nowrap backdrop-blur-md">
              Liquidation
            </div>
          </div>
        </div>

        {/* Dynamic Warning for Partial Liquidation */}
        {currentLTV >= MAX_LTV && (
          <div className="mt-2 p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl text-sm text-pink-200 animate-pulse backdrop-blur-md shadow-[0_0_15px_rgba(236,72,153,0.15)]">
            <strong className="text-pink-400">🚨 Liquidation Triggered:</strong> Instead of losing everything, the protocol will now partially liquidate your collateral to bounce your vault back to the <strong className="text-white">{SAFE_LTV}% Safe LTV</strong>.
          </div>
        )}
      </div>

      {/* Auto-Rebalancing Toggle (Soft Liquidation) */}
      <div className="border border-indigo-500/30 rounded-2xl p-6 bg-indigo-500/10 flex items-start justify-between relative z-10 backdrop-blur-sm transition-colors hover:bg-indigo-500/20">
        <div className="pr-6">
          <h4 className="font-semibold text-indigo-300 mb-1 text-lg">Enable Auto-Rebalancing</h4>
          <p className="text-sm text-indigo-200/60 leading-relaxed">
            Protect your vault. If your LTV approaches the liquidation threshold, the protocol will automatically swap a small portion of your collateral to repay debt, preventing costly auction penalties.
          </p>
        </div>
        
        {/* Toggle Switch */}
        <button 
          onClick={() => setAutoRebalance(!autoRebalance)}
          className={`relative mt-1 inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${autoRebalance ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]' : 'bg-zinc-700'}`}
        >
          <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${autoRebalance ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

    </div>
  );
};

export default EasyBorrowCard;
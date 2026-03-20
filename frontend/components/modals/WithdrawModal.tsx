// components/modals/WithdrawModal.tsx
'use client';

import { useState } from 'react';
import { X, Settings, ArrowUpToLine } from 'lucide-react';
import { Asset } from '@/types/market'; // Adjust path if necessary

type WithdrawModalProps = {
  asset: Asset;
  onClose: () => void;
};

export const WithdrawModal = ({ asset, onClose }: WithdrawModalProps) => {
  const [amount, setAmount] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-[#131316] border border-white/10 rounded-2xl shadow-2xl overflow-hidden font-sans flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <h3 className="text-xl font-semibold text-white">Withdraw {asset.symbol}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {/* Amount Section */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Amount</label>
            <div className="border border-white/10 rounded-xl bg-white/5 p-3 flex justify-between items-center focus-within:border-indigo-500/50 focus-within:bg-white/10 transition-all">
              <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 cursor-pointer hover:bg-black/60">
                <div className={`w-5 h-5 rounded-full ${asset.color} flex items-center justify-center text-[10px] font-bold text-white`}>
                  {asset.symbol.charAt(0)}
                </div>
                <span className="text-white font-medium">{asset.symbol}</span>
                <span className="text-zinc-500 text-xs">▼</span>
              </div>
              
              <div className="text-right flex flex-col items-end">
                <input 
                  type="text" 
                  placeholder="0.00" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-right bg-transparent text-xl font-bold text-white focus:outline-none placeholder:text-zinc-600"
                />
                <div className="text-xs text-zinc-500 mt-1 flex gap-2">
                  <span>$0.00</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <span className="text-xs text-zinc-500">
                Balance: {asset.walletBalance} <button onClick={() => setAmount(asset.walletBalance?.split(' ')[0] || '0')} className="text-indigo-400 font-medium ml-1 hover:text-indigo-300">MAX</button>
              </span>
            </div>
          </div>

          {/* Transaction Overview */}
          <div>
            <h4 className="text-sm text-zinc-400 mb-2">Transaction overview</h4>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 text-sm">Supply APY:</span>
                <span className="text-white font-medium">{asset.supplyApy}</span>
              </div>
              <div className="h-px bg-white/5 w-full"></div>
              <div className="flex justify-between items-start">
                <span className="text-zinc-400 text-sm">Supplied:</span>
                <div className="text-right flex flex-col gap-1">
                  <div className="flex items-center justify-end gap-2 text-white font-medium">
                    <div className={`w-4 h-4 rounded-full ${asset.color} flex items-center justify-center text-[8px] font-bold text-white`}>
                      {asset.symbol.charAt(0)}
                    </div>
                    {asset.totalDeposited}
                  </div>
                  <span className="text-zinc-500 text-xs">{asset.depositedUsd}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="flex justify-between items-center mb-2">
               <h4 className="text-sm text-zinc-400">Actions</h4>
               <Settings size={16} className="text-zinc-500 cursor-pointer hover:text-white" />
            </div>
            <div className="border border-white/5 rounded-xl p-2 bg-black/20">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-white/10 text-zinc-400 flex items-center justify-center text-xs font-bold border border-white/5">
                    1
                  </div>
                  <ArrowUpToLine size={16} className="text-zinc-400" />
                  <span className="text-white font-medium text-sm">Withdraw {asset.symbol}</span>
                </div>
                <button 
                  disabled={!amount || amount === '0'}
                  className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
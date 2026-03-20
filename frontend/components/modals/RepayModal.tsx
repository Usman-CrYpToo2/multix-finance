'use client';

import { useState } from 'react';
import { X, Settings, ArrowUpToLine, RefreshCw, Check } from 'lucide-react';
import { Asset } from '@/types/market'; // Adjust path if necessary

type RepayModalProps = {
  asset: Asset;
  onClose: () => void;
};

export const RepayModal = ({ asset, onClose }: RepayModalProps) => {
  const [amount, setAmount] = useState('');
  const [isApproved, setIsApproved] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-[#131316] border border-white/10 rounded-2xl shadow-2xl overflow-hidden font-sans flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <h3 className="text-xl font-semibold text-white">Repay {asset.symbol}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {/* Amount Section */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Amount</label>
            <div className="border border-white/10 rounded-xl bg-white/5 p-3 flex justify-between items-center focus-within:border-pink-500/50 focus-within:bg-white/10 transition-all">
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
                Balance: {asset.walletBalance} <button onClick={() => setAmount(asset.debtAmount?.split(' ')[0] || '0')} className="text-pink-400 font-medium ml-1 hover:text-pink-300">MAX</button>
              </span>
            </div>
          </div>

          {/* Transaction Overview */}
          <div>
            <h4 className="text-sm text-zinc-400 mb-2">Transaction overview</h4>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 text-sm">Remaining Debt:</span>
                <div className="flex items-center gap-2 text-white font-medium">
                  <div className={`w-4 h-4 rounded-full ${asset.color} flex items-center justify-center text-[8px] font-bold text-white`}>
                    {asset.symbol.charAt(0)}
                  </div>
                  {asset.debtAmount}
                </div>
              </div>
              <div className="h-px bg-white/5 w-full"></div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 text-sm">Health factor:</span>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded">Healthy</span>
                  <span className="text-white font-medium">184.31</span>
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
            <div className="border border-white/5 rounded-xl p-2 bg-black/20 flex flex-col gap-2">
              
              {/* Step 1: Approve */}
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border ${isApproved ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-zinc-400 border-white/5'}`}>
                    {isApproved ? <Check size={14} /> : '1'}
                  </div>
                  <RefreshCw size={16} className={isApproved ? 'text-emerald-400' : 'text-zinc-400'} />
                  <span className="text-white font-medium text-sm">Approve {asset.symbol}</span>
                </div>
                <button 
                  disabled={!amount || amount === '0' || isApproved}
                  onClick={() => setIsApproved(true)} 
                  className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  {isApproved ? 'Approved' : 'Approve'}
                </button>
              </div>

              {/* Step 2: Repay */}
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border ${isApproved ? 'bg-white/10 text-zinc-400 border-white/5' : 'bg-white/5 text-zinc-600 border-transparent'}`}>
                    2
                  </div>
                  <ArrowUpToLine size={16} className={`transform rotate-180 ${isApproved ? 'text-zinc-400' : 'text-zinc-600'}`} />
                  <span className={`${isApproved ? 'text-white' : 'text-zinc-500'} font-medium text-sm`}>Repay with {asset.symbol}</span>
                </div>
                <button 
                  disabled={!isApproved}
                  className="bg-[#E6007A] hover:bg-pink-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Repay
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
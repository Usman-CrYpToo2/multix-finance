'use client';

import { useState, useEffect } from 'react';
import { X, ArrowUpToLine, ShieldCheck } from 'lucide-react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { Asset } from '@/types/market';

// --- Minimal ABIs ---
const cdpAbi = [
  { type: 'function', name: 'getUserDebt', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }
] as const;

const routerAbi = [
  { type: 'function', name: 'repayFiat', stateMutability: 'nonpayable', inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'account', type: 'address' }, { name: 'stablecoinAmount', type: 'uint256' }], outputs: [] }
] as const;

type RepayModalProps = {
  asset: Asset;
  onClose: () => void;
};

export const RepayModal = ({ asset, onClose }: RepayModalProps) => {
  const [amount, setAmount] = useState('');
  const { address, isConnected } = useAccount();

  // Route the correct addresses based on the selected asset
  const isUSD = asset.symbol === 'USD';
  const poolAddress = isUSD ? CONTRACT_ADDRESSES.USD_Pool : CONTRACT_ADDRESSES.GBP_POOL;
  const stableAddress = isUSD ? CONTRACT_ADDRESSES.USD_Stable : CONTRACT_ADDRESSES.GBP_STABLE;
  const activePrice = isUSD ? 1.0 : 1.30; 

  // --- Read: Fetch User Debt ---
  const { data: rawDebt, refetch } = useReadContract({
    address: poolAddress as `0x${string}`,
    abi: cdpAbi,
    functionName: 'getUserDebt',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const userDebt = rawDebt ? Number(formatEther(rawDebt as bigint)) : 0;
  
  // Logic checks
  const numRepay = Number(amount) || 0;
  const isExceedingDebt = numRepay > userDebt;

  // --- Write: Execute Repayment ---
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Auto-close modal after success
  useEffect(() => {
    if (isSuccess) {
      refetch(); // Refresh the debt balance
      const timer = setTimeout(() => onClose(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, onClose, refetch]);

  // --- Handlers ---
  const handleMax = () => setAmount(userDebt.toString());

  const handleRepay = () => {
    if (!address || numRepay <= 0 || isExceedingDebt) return;
    writeContract({
      address: CONTRACT_ADDRESSES.ROUTER as `0x${string}`,
      abi: routerAbi,
      functionName: 'repayFiat',
      args: [stableAddress as `0x${string}`, address, parseEther(amount)]
    });
  };

  // Dynamic Button State
  let buttonText = `Repay with ${asset.symbol}`;
  let buttonDisabled = !amount || numRepay <= 0 || isExceedingDebt;

  if (!isConnected) {
    buttonText = 'Connect Wallet';
    buttonDisabled = true;
  } else if (isExceedingDebt) {
    buttonText = 'Amount exceeds Debt';
    buttonDisabled = true;
  } else if (isPending) {
    buttonText = 'Confirm in Wallet...';
    buttonDisabled = true;
  } else if (isConfirming) {
    buttonText = 'Repaying...';
    buttonDisabled = true;
  } else if (isSuccess) {
    buttonText = 'Repayment Successful!';
    buttonDisabled = true;
  }

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
            <div className={`border rounded-xl bg-white/5 p-3 flex justify-between items-center transition-all ${isExceedingDebt ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/10 focus-within:border-pink-500/50 focus-within:bg-white/10'}`}>
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
                  onChange={(e) => {
                    const val = e.target.value;
                    // Only allow numbers and decimals
                    if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
                  }}
                  className={`w-full text-right bg-transparent text-xl font-bold focus:outline-none placeholder:text-zinc-600 ${isExceedingDebt ? 'text-pink-500' : 'text-white'}`}
                />
                <div className="text-xs text-zinc-500 mt-1 flex gap-2">
                  <span>${(numRepay * activePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-2">
              <span className={`text-xs ${isExceedingDebt ? 'text-pink-500 animate-pulse' : 'text-transparent'}`}>
                Exceeds maximum debt
              </span>
              <span className="text-xs text-zinc-500">
                Debt: {userDebt.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.symbol} 
                <button onClick={handleMax} className="text-pink-400 font-medium ml-1 hover:text-pink-300">MAX</button>
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
                  {Math.max(0, userDebt - numRepay).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
              </div>
            </div>
          </div>

          {/* Actions - Converted to 1 Step */}
          <div>
            <div className="border border-white/5 rounded-xl p-2 bg-black/20 flex flex-col gap-2">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border ${isSuccess ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-zinc-400 border-white/5'}`}>
                    {isSuccess ? <ShieldCheck size={14} /> : '1'}
                  </div>
                  <ArrowUpToLine size={16} className={`transform rotate-180 ${isSuccess ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span className={`${isSuccess ? 'text-emerald-400' : 'text-white'} font-medium text-sm`}>
                    {isSuccess ? 'Repayment Confirmed' : `Repay with ${asset.symbol}`}
                  </span>
                </div>
                
                <button 
                  onClick={handleRepay}
                  disabled={buttonDisabled}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isSuccess 
                      ? 'bg-emerald-500/20 text-emerald-400 cursor-default' 
                      : 'bg-[#E6007A] hover:bg-pink-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white'
                  }`}
                >
                  {buttonText}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
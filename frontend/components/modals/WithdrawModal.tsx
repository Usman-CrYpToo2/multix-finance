'use client';

import { useState, useEffect } from 'react';
import { X, ArrowUpToLine, ShieldCheck } from 'lucide-react';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';
import { Asset } from '@/types/market';

// --- Minimal ABIs ---
const COLLATERAL_PRICE = 1000; // Ready for the Oracle!

const cdpAbi = [
    { type: 'function', name: 'getUserCollateral', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'getSafeWithdrawableCollateral', inputs: [{ name: '_user', type: 'address' }], outputs: [{ name: 'safeAmount', type: 'uint256' }], stateMutability: 'view' }
] as const;

const routerAbi = [
    { type: 'function', name: 'withdrawCollateral', stateMutability: 'nonpayable', inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }
] as const;

type WithdrawModalProps = {
    asset: Asset;
    onClose: () => void;
};

export const WithdrawModal = ({ asset, onClose }: WithdrawModalProps) => {
    const [amount, setAmount] = useState('');
    const { address, isConnected } = useAccount();

    // Route to the correct pool based on the asset selected in the Markets table
    const isUSD = asset.symbol === 'USD';
    const poolAddress = isUSD ? CONTRACT_ADDRESSES.USD_Pool : CONTRACT_ADDRESSES.GBP_POOL;
    const stableAddress = isUSD ? CONTRACT_ADDRESSES.USD_Stable : CONTRACT_ADDRESSES.GBP_STABLE;

    // --- Blockchain Reads ---
    const { data: contractData, refetch } = useReadContracts({
        contracts: [
            { address: poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getUserCollateral', args: address ? [address] : undefined },
            { address: poolAddress as `0x${string}`, abi: cdpAbi, functionName: 'getSafeWithdrawableCollateral', args: address ? [address] : undefined }
        ],
        query: { enabled: !!address }
    });

    const rawCollateral = contractData?.[0]?.result as bigint | undefined;
    const rawSafeWithdrawable = contractData?.[1]?.result as bigint | undefined;

    // --- Math & Logic ---
    const userCollateral = rawCollateral ? Number(formatEther(rawCollateral)) : 0;
    const safeWithdrawableNum = rawSafeWithdrawable ? Number(formatEther(rawSafeWithdrawable)) : 0;
    const numWithdraw = Number(amount) || 0;

    // 🚀 FIX 1: Use perfect BigInt math to check if the user exceeded the limit
    let isExceedingSafe = false;
    try {
        if (rawSafeWithdrawable && amount) {
            isExceedingSafe = parseEther(amount) > rawSafeWithdrawable;
        }
    } catch {
        // Ignore errors if the user is typing an incomplete decimal like "0."
    }

    // --- Blockchain Writes ---
    const { data: hash, writeContract, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    useEffect(() => {
        if (isSuccess) {
            refetch();
            const timer = setTimeout(() => onClose(), 2000);
            return () => clearTimeout(timer);
        }
    }, [isSuccess, onClose, refetch]);

    // --- Handlers ---

    // 🚀 FIX 2: Truncate the decimals to create a safe "Time Buffer"
    const handleMax = () => {
        if (!rawSafeWithdrawable) return;
        const formatted = formatEther(rawSafeWithdrawable);

        if (formatted.includes('.')) {
            const [whole, fraction] = formatted.split('.');
            // Slice off everything after 5 decimal places to guarantee it clears
            setAmount(`${whole}.${fraction.slice(0, 5)}`);
        } else {
            setAmount(formatted);
        }
    };

    const handleWithdraw = () => {
        if (!address || numWithdraw <= 0 || isExceedingSafe) return;
        writeContract({
            address: CONTRACT_ADDRESSES.ROUTER as `0x${string}`,
            abi: routerAbi,
            functionName: 'withdrawCollateral',
            args: [stableAddress as `0x${string}`, parseEther(amount)]
        });
    };

    // Dynamic Button State
    let buttonText = 'Withdraw WETH';
    let buttonDisabled = !amount || numWithdraw <= 0 || isExceedingSafe;

    if (!isConnected) {
        buttonText = 'Connect Wallet';
        buttonDisabled = true;
    } else if (isExceedingSafe) {
        buttonText = 'Amount exceeds safe limit';
        buttonDisabled = true;
    } else if (isPending) {
        buttonText = 'Confirm in Wallet...';
        buttonDisabled = true;
    } else if (isConfirming) {
        buttonText = 'Withdrawing...';
        buttonDisabled = true;
    } else if (isSuccess) {
        buttonText = 'Withdrawal Successful!';
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
                    <h3 className="text-xl font-semibold text-white">Withdraw WETH</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-6">
                    {/* Amount Section */}
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Amount</label>
                        <div className={`border rounded-xl bg-white/5 p-3 flex justify-between items-center transition-all ${isExceedingSafe ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 focus-within:border-indigo-500/50 focus-within:bg-white/10'}`}>
                            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 cursor-pointer hover:bg-black/60">
                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                                    W
                                </div>
                                <span className="text-white font-medium">WETH</span>
                                <span className="text-zinc-500 text-xs">▼</span>
                            </div>

                            <div className="text-right flex flex-col items-end">
                                <input
                                    type="text"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
                                    }}
                                    className={`w-full text-right bg-transparent text-xl font-bold focus:outline-none placeholder:text-zinc-600 ${isExceedingSafe ? 'text-indigo-400' : 'text-white'}`}
                                />
                                <div className="text-xs text-zinc-500 mt-1 flex gap-2">
                                    <span>${(numWithdraw * COLLATERAL_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between mt-2">
                            <span className={`text-xs ${isExceedingSafe ? 'text-indigo-400 animate-pulse' : 'text-transparent'}`}>
                                Exceeds safe withdrawal limit
                            </span>
                            <span className="text-xs text-zinc-500">
                                Withdrawable: {safeWithdrawableNum.toLocaleString(undefined, { maximumFractionDigits: 4 })} WETH
                                <button onClick={handleMax} className="text-indigo-400 font-medium ml-1 hover:text-indigo-300">MAX</button>
                            </span>
                        </div>
                    </div>

                    {/* Transaction Overview */}
                    <div>
                        <h4 className="text-sm text-zinc-400 mb-2">Transaction overview</h4>
                        <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3">

                            <div className="flex justify-between items-start">
                                <span className="text-zinc-400 text-sm">Collateral:</span>
                                <div className="text-right flex flex-col gap-1">
                                    <div className="flex items-center justify-end gap-2 text-white font-medium">
                                        <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-bold text-white">
                                            W
                                        </div>
                                        {userCollateral.toLocaleString(undefined, { maximumFractionDigits: 4 })} WETH
                                    </div>
                                    <span className="text-zinc-500 text-xs">
                                        ${(userCollateral * COLLATERAL_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
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
                                    <ArrowUpToLine size={16} className={`transform ${isSuccess ? 'text-emerald-400' : 'text-zinc-400'}`} />
                                    <span className={`${isSuccess ? 'text-emerald-400' : 'text-white'} font-medium text-sm`}>
                                        {isSuccess ? 'Withdrawal Confirmed' : `Withdraw WETH`}
                                    </span>
                                </div>

                                <button
                                    onClick={handleWithdraw}
                                    disabled={buttonDisabled}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isSuccess
                                            ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                                            : 'bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white'
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
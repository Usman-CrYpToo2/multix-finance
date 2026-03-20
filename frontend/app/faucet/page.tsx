'use client';

import { useState, useEffect } from 'react';
import { Link2 } from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';

// --- Minimal ABI just for the mint function ---
const wethAbi = [
  { 
    type: 'function', 
    name: 'mint', 
    stateMutability: 'nonpayable', 
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], 
    outputs: [] 
  }
] as const;

export default function FaucetPage() {
    const [walletAddress, setWalletAddress] = useState('');
    const [network, setNetwork] = useState('testnet');

    // --Hooks ---
    const { writeContract, data: hash, isPending, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Clear the input box 
    useEffect(() => {
        if (isSuccess) {
            
            const timer = setTimeout(() => {
                setWalletAddress(''); 
                reset(); 
            }, 3000);

            return () => clearTimeout(timer); 
        }
    }, [isSuccess, reset]);

    const handleMint = () => {
        if (!walletAddress) return;
        writeContract({
            address: CONTRACT_ADDRESSES.WETH,
            abi: wethAbi,
            functionName: 'mint',
            
            args: [walletAddress as `0x${string}`, parseEther('10')]
        });
    };

    // --- Dynamic Button Text ---
    let buttonText = 'Confirm Airdrop';
    if (isPending) buttonText = 'Check Wallet...';
    else if (isConfirming) buttonText = 'Minting...';
    else if (isSuccess) buttonText = 'Tokens Sent!';

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 font-sans text-white">

            {/* Main Airdrop Card */}
            <div className="w-full max-w-[600px] bg-[#0c0c0e]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 mb-6 shadow-2xl relative overflow-hidden group">

                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 blur-[100px] pointer-events-none rounded-full"></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-semibold text-white">Request WETH Airdrop</h2>

                        {/* Network Dropdown */}
                        <div className="relative">
                            <select
                                value={network}
                                onChange={(e) => setNetwork(e.target.value)}
                                className="appearance-none bg-transparent border border-white/20 hover:border-white/40 rounded-md px-4 py-1.5 pr-8 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                            >
                                <option value="testnet" className="bg-zinc-900">testnet</option>
                            </select>
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-xs">
                                ▼
                            </div>
                        </div>
                    </div>

                    <p className="text-zinc-400 text-sm mb-6">Receive 10 WETH per request</p>

                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                        <input
                            type="text"
                            placeholder="Wallet Address (0x...)"
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value)}
                            className="flex-grow bg-[#131316] border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:bg-[#1a1a1f] transition-all"
                            disabled={isPending || isConfirming}
                        />
                    </div>

                    <button
                        onClick={handleMint}
                        // Button is disabled if no address is entered, or if a transaction is running
                        disabled={!walletAddress || isPending || isConfirming}
                        className={`w-full font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSuccess 
                            ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                            : 'bg-[#7a7486] hover:bg-[#8a8496] text-[#2a2732]'
                        }`}
                    >
                        {!isSuccess && <Link2 size={18} />}
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
}
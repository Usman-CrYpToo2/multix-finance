'use client';

import dynamic from 'next/dynamic';

// Client-only: BridgeCard uses the Reown AppKit hook, which requires
// createAppKit() to have run in the browser first (Web3Provider.tsx).
const BridgeCard = dynamic(() => import('@/components/bridge/BridgeCard').then((mod) => mod.BridgeCard), {
  ssr: false,
});

export default function BridgePage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Cross-Chain Bridge</h1>
        <p className="text-zinc-400 text-sm mt-2 max-w-md mx-auto">
          Move MultiX stablecoins between Somnia Testnet and Ethereum Sepolia.
        </p>
      </div>

      <BridgeCard />
    </div>
  );
}

'use client'

import React, { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia, somniaTestnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

// Setup queryClient
const queryClient = new QueryClient()

// 1. Get projectId from env (Fallback to your hardcoded ID for hackathon speed)
const projectId = 'caa3ce56c68acc48b670d45608afdfb9';

if (!projectId) {
  throw new Error('Project ID is not defined')
}

// 2. Create a metadata object for app
const metadata = {
  name: 'MultiX Finance',
  description: 'Cross-chain stablecoin protocol',
  url: 'http://localhost:3000', 
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

// 3. Define the networks
// Somnia Testnet is first so it's the default network AppKit connects to -
// that's where the MultiX protocol (Factory/Router/CDPEngine/Stablecoins) is
// actually deployed. mainnet/sepolia are kept around for the Sepolia side of
// the Hyperlane bridge (see hyperlane/README.md); foundry/local-anvil was
// removed since the protocol no longer lives there.
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [somniaTestnet, sepolia, mainnet]

// 4. Create the Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: false // Required for Next.js App Router
})

// 5. Initialize the Reown AppKit Modal
if (typeof window !== 'undefined') {
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    themeMode: 'dark',
    features: {
      analytics: true
    },
    
    // Both the --apkt-* and --w3m-* names are set: which pair this AppKit build
    // reads depends on its internal theme layer, and the unused ones are ignored.
    themeVariables: {
      // Brand pink, so the navbar connect button matches the app instead of
      // rendering in AppKit's default blue.
      "--apkt-accent": "#E6007A",
      "--w3m-accent": "#E6007A",
      // Tint the modal toward the app's near-black background rather than a grey.
      "--apkt-color-mix": "#09090b",
      "--w3m-color-mix": "#09090b",
      "--apkt-color-mix-strength": 20,
      "--w3m-color-mix-strength": 20,
      // Our own overlays (mobile nav drawer, withdraw/repay modals) sit at z-100/101,
      // so the wallet modal has to outrank them or it opens behind them.
      "--apkt-z-index": 999,
      "--w3m-z-index": 999,
    },
  })
}

// 6. Wrap your application
export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
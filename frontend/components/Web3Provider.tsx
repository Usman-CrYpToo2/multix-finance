'use client'

import React, { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, sepolia, foundry } from '@reown/appkit/networks'
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
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, sepolia, foundry]

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
    
    themeVariables: {
    "--apkt-accent": "#68389c", // Changes button color to red
    "--apkt-color-mix": "#3b3640",
    "--apkt-color-mix-strength": 40,
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
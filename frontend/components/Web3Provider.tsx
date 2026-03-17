'use client'

import React, { ReactNode } from 'react'
import { config } from '@/config/wagmi'
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { State, WagmiProvider } from 'wagmi'

const queryClient = new QueryClient()

const projectId = 'caa3ce56c68acc48b670d45608afdfb9';

if (typeof window !== 'undefined') {
  if (!projectId) throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set in .env.local')
  createWeb3Modal({
    wagmiConfig: config,
    projectId,
    enableAnalytics: true,
    themeMode: 'dark'
  })
}

export function Web3Provider({ children, initialState }: { children: ReactNode, initialState?: State }) {
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
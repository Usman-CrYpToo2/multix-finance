'use client'

import EasyBorrowCard from "@/components/EasyBorrowCard" 

export default function BorrowPage() {
  return (
    <main className="container mx-auto px-4 py-12 md:py-20">
      
      <div className="flex flex-col items-center justify-center mb-12 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
          Manage Vault
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl">
          Deposit collateral and mint cross-chain stablecoins instantly.
        </p>
      </div>
      
      <EasyBorrowCard />
    </main>
  )
}
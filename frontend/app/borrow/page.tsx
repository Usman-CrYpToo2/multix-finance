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
      
      <div className="max-w-3xl mx-auto mt-6 flex justify-end">
         <button className="bg-white/10 hover:bg-indigo-600 text-white border border-white/10 hover:border-indigo-500 px-8 py-3 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]">
           Confirm Transaction
         </button>
      </div>

    </main>
  )
}
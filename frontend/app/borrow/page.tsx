'use client'

import { Suspense } from 'react'
import EasyBorrowCard from "@/components/EasyBorrowCard"

export default function BorrowPage() {
  return (
    <main className="container mx-auto px-4 py-12 md:py-20">
      {/* useVaultData reads the ?asset= query param via useSearchParams, which
          Next.js requires to be wrapped in Suspense. */}
      <Suspense>
        <EasyBorrowCard />
      </Suspense>
    </main>
  )
}
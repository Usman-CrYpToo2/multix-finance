import Link from 'next/link'

export const Navbar = () => {
    return (
        <nav className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                
                <div className="flex items-center gap-8 md:gap-12">
                    {/*/ Logo */}
                    <div className="font-bold text-2xl text-white tracking-tight flex items-center gap-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="#E6007A"/>
                        </svg>
                        MULTIX
                    </div>
                    
                    {/* Navigation Links */}
                    <div className="hidden md:flex gap-6 items-center pt-1">
                        <Link href="/markets" className="text-[15px] font-medium text-zinc-400 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all">
                            Markets
                        </Link>
                        <Link href="/borrow" className="text-[15px] font-medium text-zinc-400 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all">
                            Borrow
                        </Link>
                        <Link href="/faucet" className="text-[15px] font-medium text-zinc-400 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all">
                            Faucet
                        </Link>
                    </div>
                </div>

                {/* Connect Button */}
                <div className="flex items-center">
                    {/* @ts-ignore */}
                    <w3m-button />
                </div>
                
            </div>
        </nav>
    )
}
"use client";

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react'; 

export const Navbar = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Helper to close the menu when a link is clicked
    const closeMenu = () => setIsMobileMenuOpen(false);

    return (
        <>
            <nav className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    
                    <div className="flex items-center gap-4 md:gap-12">
                        
                        <button 
                            className="md:hidden text-zinc-400 hover:text-white transition-colors"
                            onClick={() => setIsMobileMenuOpen(true)}
                        >
                            <Menu size={28} />
                        </button>

                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2" onClick={closeMenu}>
                            <div className="font-bold text-2xl text-white tracking-tight flex items-center gap-2">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="#E6007A" />
                                </svg>
                                MULTIX
                            </div>
                        </Link>
                        
                        {/*Nav Links */}
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
                        <appkit-button /> 
                    </div>
                </div>
            </nav>

            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] md:hidden transition-opacity"
                    onClick={closeMenu}
                />
            )}

            <div className={`fixed top-0 left-0 h-full w-64 bg-zinc-950 border-r border-white/10 z-[101] transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                {/* Sidebar Header */}
                <div className="h-20 px-6 border-b border-white/10 flex items-center justify-between">
                    <div className="font-bold text-xl text-white tracking-tight flex items-center gap-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="#E6007A" />
                        </svg>
                        Menu
                    </div>
                    <button onClick={closeMenu} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Sidebar Links */}
                <div className="flex flex-col px-6 py-8 gap-6">
                    <Link href="/markets" onClick={closeMenu} className="text-lg font-medium text-zinc-400 hover:text-white transition-colors">
                        Markets
                    </Link>
                    <Link href="/borrow" onClick={closeMenu} className="text-lg font-medium text-zinc-400 hover:text-white transition-colors">
                        Borrow
                    </Link>
                    <Link href="/faucet" onClick={closeMenu} className="text-lg font-medium text-zinc-400 hover:text-white transition-colors">
                        Faucet
                    </Link>
                </div>
            </div>
        </>
    );
};
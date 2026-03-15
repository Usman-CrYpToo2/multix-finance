'use client'; 

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen bg-transparent overflow-hidden font-sans selection:bg-pink-500/30">
      
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 md:pt-40 pb-20 min-h-[calc(100vh-64px)] flex flex-col justify-between">
        
        {/* Hero Text */}
        <div className="max-w-4xl">
          <h1 
            className={`text-[4rem] md:text-[6.5rem] leading-[1.05] font-medium text-white tracking-tight transition-all duration-1000 ease-out transform ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
          >
            Institutional-Grade <br /> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-400">
              Stability
            </span>
          </h1>
          
          <p 
            className={`mt-6 md:mt-8 text-lg md:text-xl text-zinc-400 max-w-md leading-relaxed font-medium transition-all duration-1000 delay-200 ease-out transform ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            Borrow against your assets with unprecedented safety. Our novel partial-liquidation engine and soft-rebalancing mechanisms ensure your collateral is protected across every chain.
          </p>
        </div>

        {/* Bottom Cards Section */}
        <div 
          className={`flex flex-col md:flex-row justify-between items-end gap-6 mt-20 md:mt-32 transition-all duration-1000 delay-500 ease-out transform ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
        >
          
          {/* Left Action Card - Dark */}
          <Link 
            href="/markets" 
            className="group w-full md:w-72 bg-white/5 backdrop-blur-md border border-white/10 hover:border-pink-500/50 hover:bg-white/10 rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between aspect-[2/1] md:aspect-[4/3] cursor-pointer shadow-2xl"
          >
            <div className="flex justify-between items-start">
              <span className="p-2 bg-white/5 rounded-full border border-white/10 group-hover:bg-pink-500 transition-colors">
                {/* SVG Arrow turns white on hover to contrast with the pink background */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </span>
            </div>
            <div className="font-semibold text-xl text-white">
              Launch dApp
            </div>
          </Link>

          {/* Right TVL Card  */}
          <div className="w-full md:w-[420px] bg-black/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
            {/* Hover glow effect*/}
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <span className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
                  Cross-Chain Protocol TVL
                </span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-4 bg-zinc-600 rounded-sm"></div>
                  <div className="w-1.5 h-4 bg-zinc-500 rounded-sm"></div>
                  <div className="w-1.5 h-4 bg-pink-500 rounded-sm shadow-[0_0_8px_rgba(230,0,122,0.8)]"></div>
                </div>
              </div>
              <div className="text-5xl md:text-6xl font-medium text-white tracking-tight">
                $33.7M
              </div>
            </div>
            
            {/* Bottom glowing line */}
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-pink-500 to-[#E6007A]"></div>
          </div>

        </div>
      </main>
    </div>
  );
}
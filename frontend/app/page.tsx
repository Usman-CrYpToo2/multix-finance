'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Radio, ShieldHalf, Waypoints } from 'lucide-react';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import { useOraclePrices } from '@/hooks/useOraclePrices';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';

const FEATURES = [
  {
    icon: Boxes,
    title: 'Any fiat currency',
    body: 'One factory deploys a stablecoin and an isolated CDP engine per currency, each with its own risk parameters.',
  },
  {
    icon: ShieldHalf,
    title: 'Partial liquidations',
    body: 'Positions are trimmed back to a safe ratio instead of being closed out. Full liquidation only past 100% LTV.',
  },
  {
    icon: Radio,
    title: 'Consensus pricing',
    body: 'Rates are fetched by a Somnia Agents validator subcommittee and written on consensus — not pushed by one bot.',
  },
  {
    icon: Waypoints,
    title: 'Cross-chain by default',
    body: 'Route any synthetic to Ethereum and back over Hyperlane, backed 1:1 by collateral locked on Somnia.',
  },
];

const MARKETS = [
  { id: 'GBP', name: 'Pound Sterling', icon: '/icons/tokens/gbp.svg', priceKey: 'gbpUsdPrice' as const },
  { id: 'USD', name: 'US Dollar', icon: '/icons/tokens/usd.svg', priceKey: 'usdUsdPrice' as const },
];

/** Compact, exchange-style money formatting: $1.2M / $34.5K / $912.34 */
const compactUsd = (n: number) => {
  if (!Number.isFinite(n)) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const { tvlUsd, mintedUsd, marketCount } = useProtocolStats();
  const { gbpUsdPrice, usdUsdPrice } = useOraclePrices();
  const prices = { gbpUsdPrice, usdUsdPrice };

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  const enter = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
    }`;

  const STATS = [
    { label: 'Total value locked', value: compactUsd(tvlUsd) },
    { label: 'Stablecoins minted', value: compactUsd(mintedUsd) },
    { label: 'Fiat markets', value: String(marketCount) },
    { label: 'Collateral', value: 'WETH' },
  ];

  return (
    <div className="relative font-sans selection:bg-pink-500/30">
      <main className="relative z-10">
        {/* ---------------- Hero ---------------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-14 sm:pt-20 md:pt-28 pb-14 md:pb-20">
          <div className={enter('delay-0')}>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 bg-white/5 border border-white/10 rounded-full pl-2 pr-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              Live on Somnia Testnet
            </span>
          </div>

          <h1
            className={`mt-6 text-[2.75rem] leading-[1.05] sm:text-6xl md:text-7xl lg:text-[5.25rem] font-semibold text-white tracking-[-0.03em] ${enter('delay-75')}`}
          >
            Multi-Fiat
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-pink-400 to-indigo-400">
              Stability
            </span>
          </h1>

          <p
            className={`mt-6 text-lg sm:text-xl text-zinc-400 max-w-lg leading-relaxed ${enter('delay-150')}`}
          >
            Borrow synthetic stablecoins in any fiat currency, fully backed by crypto collateral.
          </p>

          <div className={`mt-9 flex flex-col sm:flex-row gap-3 ${enter('delay-200')}`}>
            <Link
              href="/borrow"
              className="group inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-semibold px-7 py-3.5 rounded-full transition-colors"
            >
              Launch app
              <ArrowUpRight size={17} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              href="/markets"
              className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-7 py-3.5 rounded-full transition-colors"
            >
              Explore markets
            </Link>
          </div>

          {/* Stats — live, read from both CDP engines */}
          <div
            className={`mt-14 md:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden ${enter('delay-300')}`}
          >
            {STATS.map((s) => (
              <div key={s.label} className="bg-[#0c0c0f] px-5 py-6 sm:px-6 sm:py-7">
                <div className="text-2xl sm:text-3xl font-semibold text-white tracking-tight tabular">
                  {s.value}
                </div>
                <div className="mt-1.5 text-[11px] sm:text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Features ---------------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 border-t border-white/[0.06]">
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-[-0.02em]">
            Built for many currencies
          </h2>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Most CDP protocols mint one stablecoin. MultiX treats the currency as a parameter.
          </p>

          <div className="mt-10 md:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/[0.07] border border-white/[0.07] rounded-2xl overflow-hidden">
            {FEATURES.map((f) => (
              <div key={f.title} className="group bg-[#0c0c0f] hover:bg-[#101014] transition-colors p-7 sm:p-9">
                <f.icon size={20} className="text-pink-400" strokeWidth={1.75} />
                <h3 className="mt-5 font-semibold text-white text-lg tracking-tight">{f.title}</h3>
                <p className="mt-2.5 text-zinc-400 text-[15px] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Markets ---------------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-[-0.02em]">
                Markets
              </h2>
              <p className="mt-3 text-zinc-400">Live peg rates, read from the on-chain oracle.</p>
            </div>
            <Link
              href="/markets"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              All markets <ArrowUpRight size={15} />
            </Link>
          </div>

          <div className="mt-8 md:mt-10 divide-y divide-white/[0.07] border border-white/[0.07] rounded-2xl overflow-hidden">
            {MARKETS.map((m) => (
              <Link
                key={m.id}
                href={`/borrow?asset=${m.id}`}
                className="group flex items-center justify-between gap-4 bg-[#0c0c0f] hover:bg-[#101014] transition-colors px-5 sm:px-7 py-5"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full shrink-0 overflow-hidden">
                    <img src={m.icon} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{m.name}</div>
                    <div className="text-zinc-500 text-sm">{m.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right">
                    <div className="text-white font-medium tabular">
                      ${prices[m.priceKey].toFixed(4)}
                    </div>
                    <div className="text-zinc-500 text-xs">per {m.id}</div>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="text-zinc-600 group-hover:text-white transition-colors"
                  />
                </div>
              </Link>
            ))}

            {/* The two live markets are the current state, not the ceiling. */}
            <div className="bg-[#0c0c0f] px-5 sm:px-7 py-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border border-dashed border-white/20 flex items-center justify-center shrink-0">
                <Boxes size={16} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">
                EUR, JPY and any other peg are one factory deployment away.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Deployment / transparency ---------------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 border-t border-white/[0.06]">
          <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-[-0.02em]">
            Deployment
          </h2>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Every contract is verifiable on the Somnia explorer.
          </p>

          <dl className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-2xl overflow-hidden">
            {[
              { label: 'Factory', addr: CONTRACT_ADDRESSES.FACTORY },
              { label: 'Router', addr: CONTRACT_ADDRESSES.ROUTER },
              { label: 'Oracle', addr: CONTRACT_ADDRESSES.ORACLE },
              { label: 'Collateral (WETH)', addr: CONTRACT_ADDRESSES.WETH },
            ].map((c) => (
              <div key={c.label} className="bg-[#0c0c0f] p-6">
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {c.label}
                </dt>
                <dd className="mt-2">
                  <a
                    href={`https://shannon-explorer.somnia.network/address/${c.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-sm text-zinc-300 hover:text-white transition-colors"
                  >
                    {short(c.addr)}
                    <ArrowUpRight size={13} className="text-zinc-600" />
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pb-16 md:pb-24">
          <div className="relative overflow-hidden border border-white/10 rounded-3xl px-6 sm:px-14 py-14 sm:py-20 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(230,0,122,0.14)_0%,_transparent_65%)]" />
            <div className="relative">
              <h2 className="text-3xl sm:text-5xl font-semibold text-white tracking-[-0.02em]">
                Open your first position
              </h2>
              <p className="mt-4 text-zinc-400 max-w-md mx-auto">
                Claim testnet WETH, deposit it as collateral, and start borrowing in minutes.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/borrow"
                  className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 font-semibold px-8 py-3.5 rounded-full transition-colors"
                >
                  Launch app
                </Link>
                <Link
                  href="/faucet"
                  className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-8 py-3.5 rounded-full transition-colors"
                >
                  Get testnet WETH
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Footer ---------------- */}
        <footer className="border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 text-white font-bold tracking-tight">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="#E6007A" />
                </svg>
                MULTIX
              </div>
              <p className="mt-3 text-sm text-zinc-500 max-w-[22ch]">
                Multi-fiat collateralised debt positions.
              </p>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Protocol</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/markets" className="text-zinc-400 hover:text-white transition-colors">Markets</Link></li>
                <li><Link href="/borrow" className="text-zinc-400 hover:text-white transition-colors">Borrow</Link></li>
                <li><Link href="/bridge" className="text-zinc-400 hover:text-white transition-colors">Bridge</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Testnet</div>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/faucet" className="text-zinc-400 hover:text-white transition-colors">Faucet</Link></li>
                <li>
                  <a href="https://shannon-explorer.somnia.network" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors">
                    Somnia explorer
                  </a>
                </li>
                <li>
                  <a href="https://explorer.hyperlane.xyz" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors">
                    Hyperlane explorer
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Network</div>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-400">
                <li>Somnia Testnet</li>
                <li className="tabular">Chain ID 50312</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.06]">
            <div className="max-w-6xl mx-auto px-5 sm:px-6 py-5 text-xs text-zinc-600">
              Testnet deployment. Tokens carry no monetary value.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

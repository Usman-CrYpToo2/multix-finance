'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { BRIDGE_CHAINS, ChainKey } from '@/constants/bridgeConfig';

type SelectNetworkModalProps = {
  title: string;
  selectedKey: ChainKey;
  disabledKey?: ChainKey; // the chain already chosen on the other side
  onSelect: (key: ChainKey) => void;
  onClose: () => void;
};

export const SelectNetworkModal = ({ title, selectedKey, disabledKey, onSelect, onClose }: SelectNetworkModalProps) => {
  const [query, setQuery] = useState('');

  const chains = BRIDGE_CHAINS.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-[#131316] border border-white/10 rounded-2xl shadow-2xl overflow-hidden font-sans flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 border border-white/10 bg-white/5 rounded-xl px-3 py-2.5 focus-within:border-indigo-500/50">
            <Search size={16} className="text-zinc-500 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search by network name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between px-1 mb-2">
              <span className="text-xs font-medium text-zinc-500">Core Chains</span>
              <span className="text-xs text-zinc-600">Native Token</span>
            </div>

            <div className="flex flex-col gap-1">
              {chains.map((chain) => {
                const isDisabled = chain.key === disabledKey;
                const isSelected = chain.key === selectedKey;
                return (
                  <button
                    key={chain.key}
                    disabled={isDisabled}
                    onClick={() => {
                      onSelect(chain.key);
                      onClose();
                    }}
                    className={`flex items-center justify-between px-3 py-3 rounded-xl transition-colors text-left ${
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'bg-white/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full ${chain.color} flex items-center justify-center text-xs font-bold text-white`}>
                        {chain.letter}
                      </div>
                      <span className="text-white font-medium text-sm">{chain.name}</span>
                    </div>
                    <span className="text-zinc-500 text-sm">{chain.nativeSymbol}</span>
                  </button>
                );
              })}
              {chains.length === 0 && (
                <p className="text-center text-sm text-zinc-500 py-6">No networks match &ldquo;{query}&rdquo;</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { BRIDGE_TOKENS, BridgeTokenId } from '@/constants/bridgeConfig';

type SelectTokenModalProps = {
  selectedId: BridgeTokenId;
  balances?: Partial<Record<BridgeTokenId, string>>;
  onSelect: (id: BridgeTokenId) => void;
  onClose: () => void;
};

export const SelectTokenModal = ({ selectedId, balances, onSelect, onClose }: SelectTokenModalProps) => {
  const [query, setQuery] = useState('');

  const tokens = BRIDGE_TOKENS.filter(
    (t) => t.symbol.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-[#131316] border border-white/10 rounded-2xl shadow-2xl overflow-hidden font-sans flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <h3 className="text-xl font-semibold text-white">Select Token</h3>
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
              placeholder="Search by token name or symbol"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            {tokens.map((token) => {
              const isSelected = token.id === selectedId;
              const balance = balances?.[token.id];
              return (
                <button
                  key={token.id}
                  onClick={() => {
                    onSelect(token.id);
                    onClose();
                  }}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl transition-colors text-left ${
                    isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${token.color} flex items-center justify-center text-xs font-bold text-white`}>
                      {token.symbol[0]}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-sm">{token.symbol}</span>
                      <span className="text-zinc-500 text-xs">{token.name}</span>
                    </div>
                  </div>
                  {balance !== undefined && <span className="text-zinc-400 text-sm">{balance}</span>}
                </button>
              );
            })}
            {tokens.length === 0 && (
              <p className="text-center text-sm text-zinc-500 py-6">No tokens match &ldquo;{query}&rdquo;</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

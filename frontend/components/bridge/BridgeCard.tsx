'use client';

import { useState } from 'react';
import { ArrowDownUp, ChevronDown, ExternalLink } from 'lucide-react';
import { useAccount } from 'wagmi';
import { formatUnits, isAddress, parseUnits, type Address } from 'viem';
import { useAppKit } from '@reown/appkit/react';
import { BRIDGE_TOKENS, BridgeTokenId, ChainKey, getChain, getToken } from '@/constants/bridgeConfig';
import { useBridgeTransfer, useChainTokenBalance } from '@/hooks/useBridgeTransfer';
import { SelectNetworkModal } from './SelectNetworkModal';
import { SelectTokenModal } from './SelectTokenModal';

type ActiveModal = 'source' | 'destination' | 'token' | null;

const explorerBase: Record<ChainKey, string> = {
  somnia: 'https://shannon-explorer.somnia.network/tx/',
  sepolia: 'https://sepolia.etherscan.io/tx/',
};

export const BridgeCard = () => {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();

  const [sourceChain, setSourceChain] = useState<ChainKey>('somnia');
  const [destChain, setDestChain] = useState<ChainKey>('sepolia');
  const [tokenId, setTokenId] = useState<BridgeTokenId>('GBP');
  const [amount, setAmount] = useState('');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [sendToCustom, setSendToCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [agreed, setAgreed] = useState(false);

  const token = getToken(tokenId);
  const source = getChain(sourceChain);
  const dest = getChain(destChain);

  const sourceBalance = useChainTokenBalance(sourceChain, tokenId, address);
  const destBalance = useChainTokenBalance(destChain, tokenId, address);

  const numAmount = Number(amount) || 0;
  const exceedsBalance = Boolean(
    sourceBalance.raw !== undefined && amount && numAmount > Number(formatUnits(sourceBalance.raw, sourceBalance.decimals))
  );

  const customAddressValid = !sendToCustom || isAddress(customAddress);
  const recipient: Address | undefined = sendToCustom
    ? (customAddressValid ? (customAddress as Address) : undefined)
    : address;

  let amountWei: bigint | undefined;
  try {
    amountWei = amount && numAmount > 0 ? parseUnits(amount, sourceBalance.decimals) : undefined;
  } catch {
    amountWei = undefined;
  }

  const bridge = useBridgeTransfer({ tokenId, sourceChain, destChain, amountWei, recipient });

  const swapChains = () => {
    setSourceChain(destChain);
    setDestChain(sourceChain);
    bridge.reset();
  };

  let buttonText = 'Enter an amount';
  let buttonDisabled = true;
  let buttonAction: (() => void) | undefined;

  if (!isConnected) {
    buttonText = 'Connect Wallet';
    buttonDisabled = false;
    buttonAction = () => open();
  } else if (sourceChain === destChain) {
    buttonText = 'Select different networks';
  } else if (!amount || numAmount <= 0) {
    buttonText = 'Enter an amount';
  } else if (exceedsBalance) {
    buttonText = 'Insufficient balance';
  } else if (sendToCustom && !customAddressValid) {
    buttonText = customAddress ? 'Invalid destination address' : 'Enter a destination address';
  } else if (!agreed) {
    buttonText = 'Accept terms to continue';
  } else if (bridge.transferSuccess) {
    buttonText = 'Bridge Submitted';
    buttonDisabled = true;
  } else if (bridge.isTransferring) {
    buttonText = 'Bridging...';
    buttonDisabled = true;
  } else if (bridge.isApproving) {
    buttonText = `Approving ${token.symbol}...`;
    buttonDisabled = true;
  } else if (bridge.requiresApproval) {
    buttonText = `Approve ${token.symbol}`;
    buttonDisabled = false;
    buttonAction = bridge.approve;
  } else {
    buttonText = `Bridge to ${dest.name}`;
    buttonDisabled = bridge.gasQuote === undefined;
    buttonAction = bridge.transfer;
  }

  return (
    <div className="w-full max-w-120 mx-auto">
      <div className="bg-[#131316] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl font-sans">
        {/* From box */}
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 relative">
          <button
            onClick={() => setActiveModal('source')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg text-sm mb-3"
          >
            <span className="text-zinc-400">From:</span>
            <div className={`w-4 h-4 rounded-full ${source.color} flex items-center justify-center text-[9px] font-bold text-white`}>
              {source.letter}
            </div>
            <span className="text-white font-medium">{source.name}</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>

          <div className="flex justify-between items-center gap-3">
            <input
              type="text"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                  bridge.reset();
                }
              }}
              className={`w-full min-w-0 bg-transparent text-3xl font-semibold focus:outline-none placeholder:text-zinc-700 ${
                exceedsBalance ? 'text-pink-400' : 'text-white'
              }`}
            />
            <button
              onClick={() => setActiveModal('token')}
              className="flex items-center gap-2 bg-black/40 hover:bg-black/60 transition-colors px-3 py-2 rounded-full border border-white/5 shrink-0"
            >
              <div className={`w-5 h-5 rounded-full ${token.color} flex items-center justify-center text-[10px] font-bold text-white`}>
                {token.symbol[0]}
              </div>
              <span className="text-white font-medium text-sm">{token.symbol}</span>
              <ChevronDown size={14} className="text-zinc-500" />
            </button>
          </div>

          <div className="flex justify-between mt-2">
            <span className={`text-xs ${exceedsBalance ? 'text-pink-400' : 'text-transparent'}`}>Exceeds available balance</span>
            {isConnected && sourceBalance.available && (
              <span className="text-xs text-zinc-500">
                Balance: {sourceBalance.formatted} {token.symbol}
                {Boolean(sourceBalance.raw) && (
                  <button
                    onClick={() => setAmount(formatUnits(sourceBalance.raw!, sourceBalance.decimals))}
                    className="text-indigo-400 font-medium ml-1 hover:text-indigo-300"
                  >
                    MAX
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Swap button */}
        <div className="relative h-0 flex justify-center">
          <button
            onClick={swapChains}
            className="absolute -top-3.5 w-9 h-9 rounded-full bg-[#1e1e22] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors z-10"
            aria-label="Swap networks"
          >
            <ArrowDownUp size={15} className="text-zinc-300" />
          </button>
        </div>

        {/* To box */}
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 mt-3">
          <button
            onClick={() => setActiveModal('destination')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg text-sm mb-3"
          >
            <span className="text-zinc-400">To:</span>
            <div className={`w-4 h-4 rounded-full ${dest.color} flex items-center justify-center text-[9px] font-bold text-white`}>
              {dest.letter}
            </div>
            <span className="text-white font-medium">{dest.name}</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>

          <div className="flex justify-between items-center gap-3">
            <span className="text-3xl font-semibold text-zinc-600">{amount || '-'}</span>
            <div className="flex items-center gap-2 bg-black/20 px-3 py-2 rounded-full border border-white/5 shrink-0 opacity-70">
              <div className={`w-5 h-5 rounded-full ${token.color} flex items-center justify-center text-[10px] font-bold text-white`}>
                {token.symbol[0]}
              </div>
              <span className="text-zinc-300 font-medium text-sm">{token.symbol}</span>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            {isConnected && destBalance.available && (
              <span className="text-xs text-zinc-500">
                Balance: {destBalance.formatted} {token.symbol}
              </span>
            )}
          </div>
        </div>

        {/* Receive row */}
        <div className="flex justify-between items-center mt-4 px-1">
          <span className="text-white font-medium text-sm">Receive</span>
          <button
            onClick={() => setSendToCustom((v) => !v)}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {sendToCustom ? 'Send to my wallet' : 'Send to custom address'}
            <ChevronDown size={14} />
          </button>
        </div>

        {sendToCustom && (
          <input
            type="text"
            placeholder="Destination address (0x...)"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            className={`w-full mt-2 bg-black/20 border rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${
              customAddress && !customAddressValid ? 'border-pink-500/50' : 'border-white/10 focus:border-indigo-500/50'
            }`}
          />
        )}

        {/* Gas quote */}
        {bridge.gasQuote !== undefined && sourceChain !== destChain && (
          <div className="flex justify-between items-center mt-3 px-1 text-xs text-zinc-500">
            <span>Interchain gas fee</span>
            <span>
              {Number(formatUnits(bridge.gasQuote, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {source.nativeSymbol}
            </span>
          </div>
        )}

        {/* Terms */}
        <label className="flex items-center gap-2 mt-4 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 accent-indigo-500"
          />
          <span className="text-sm text-zinc-400">
            I have read and agree to the{' '}
            <span className="underline text-zinc-300 hover:text-white transition-colors">Terms and Conditions</span>.
          </span>
        </label>

        {/* Action button */}
        <button
          onClick={buttonAction}
          disabled={buttonDisabled}
          className="w-full mt-4 py-4 rounded-2xl font-bold text-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-colors"
        >
          {buttonText}
        </button>

        {bridge.transferSuccess && bridge.transferHash && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <a
              href={`${explorerBase[sourceChain]}${bridge.transferHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              View transaction <ExternalLink size={12} />
            </a>
            <p className="text-xs text-zinc-500 text-center">
              Funds usually arrive on {dest.name} within a few minutes once the message is relayed.
            </p>
          </div>
        )}
      </div>

      {activeModal === 'source' && (
        <SelectNetworkModal
          title="Select Source Network"
          selectedKey={sourceChain}
          disabledKey={destChain}
          onSelect={setSourceChain}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'destination' && (
        <SelectNetworkModal
          title="Select Destination Network"
          selectedKey={destChain}
          disabledKey={sourceChain}
          onSelect={setDestChain}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'token' && (
        <SelectTokenModal selectedId={tokenId} onSelect={setTokenId} onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
};

// Re-exported for convenience if a parent wants the token list without importing the config directly.
export { BRIDGE_TOKENS };

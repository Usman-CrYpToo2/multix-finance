'use client';

import { useEffect, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
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

  const token = getToken(tokenId);
  const source = getChain(sourceChain);
  const dest = getChain(destChain);

  const sourceBalance = useChainTokenBalance(sourceChain, tokenId, address);

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
  const destBalance = bridge.destBalance;

  // The source balance is already final once the dispatch tx confirms (tokens are
  // locked/burned in that same tx) - refetch it then instead of waiting on a reload.
  useEffect(() => {
    if (bridge.transferSuccess) sourceBalance.refetch();
  }, [bridge.transferSuccess, sourceBalance.refetch]);

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
  } else if (bridge.delivered) {
    buttonText = 'Bridge Complete';
    buttonDisabled = true;
  } else if (bridge.transferSuccess) {
    buttonText = 'Relaying...';
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
            <div className={`w-4 h-4 rounded-full ${source.color} flex items-center justify-center overflow-hidden`}>
              <img src={source.icon} alt={source.name} className="w-3 h-3 object-contain" />
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
              <div className="w-5 h-5 rounded-full overflow-hidden">
                <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" />
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
            <div className={`w-4 h-4 rounded-full ${dest.color} flex items-center justify-center overflow-hidden`}>
              <img src={dest.icon} alt={dest.name} className="w-3 h-3 object-contain" />
            </div>
            <span className="text-white font-medium">{dest.name}</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>

          <div className="flex justify-between items-center gap-3">
            <span className="text-3xl font-semibold text-zinc-600">{amount || '-'}</span>
            <div className="flex items-center gap-2 bg-black/20 px-3 py-2 rounded-full border border-white/5 shrink-0 opacity-70">
              <div className="w-5 h-5 rounded-full overflow-hidden">
                <img src={token.icon} alt={token.symbol} className="w-full h-full object-cover" />
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

        {/* Action button */}
        <button
          onClick={buttonAction}
          disabled={buttonDisabled}
          className="w-full mt-4 py-4 rounded-2xl font-bold text-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-colors"
        >
          {buttonText}
        </button>

        {bridge.error && !bridge.isTransferring && !bridge.isApproving && (
          <p className="mt-3 text-xs text-pink-400 text-center break-words">
            {bridge.error.message.split('\n')[0]}
          </p>
        )}

        {bridge.transferSuccess && bridge.transferHash && (
          <BridgeProgress
            sourceChain={sourceChain}
            destChain={destChain}
            transferHash={bridge.transferHash}
            messageId={bridge.messageId}
            delivered={bridge.delivered}
            elapsedSeconds={bridge.elapsedSeconds}
          />
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

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

type BridgeProgressProps = {
  sourceChain: ChainKey;
  destChain: ChainKey;
  transferHash: `0x${string}`;
  messageId: `0x${string}` | undefined;
  delivered: boolean;
  elapsedSeconds: number;
};

/** Live delivery tracker: dispatch -> relay -> delivered, polling the destination balance so it updates itself with no reload. */
const BridgeProgress = ({ sourceChain, destChain, transferHash, messageId, delivered, elapsedSeconds }: BridgeProgressProps) => {
  const source = getChain(sourceChain);
  const dest = getChain(destChain);

  const StepIcon = ({ done, active }: { done: boolean; active: boolean }) =>
    done ? (
      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
        <Check size={12} className="text-white" strokeWidth={3} />
      </div>
    ) : active ? (
      <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
        <Loader2 size={12} className="text-indigo-400 animate-spin" />
      </div>
    ) : (
      <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 shrink-0" />
    );

  return (
    <div className="mt-4 bg-black/20 border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0 pt-0.5">
          <StepIcon done active={false} />
          <div className={`w-px h-6 ${delivered ? 'bg-emerald-500' : 'bg-white/10'}`} />
          <StepIcon done={delivered} active={!delivered} />
        </div>
        <div className="flex-1 flex flex-col gap-5">
          <div>
            <p className="text-sm text-white font-medium">Submitted on {source.name}</p>
            <a
              href={`${explorerBase[sourceChain]}${transferHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-0.5"
            >
              View transaction <ExternalLink size={11} />
            </a>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {delivered ? `Delivered on ${dest.name}` : `Relaying to ${dest.name}...`}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {delivered
                ? 'Destination balance updated automatically.'
                : `Waiting for the Hyperlane relayer · ${formatElapsed(elapsedSeconds)} elapsed`}
            </p>
            {messageId && (
              <a
                href={`https://explorer.hyperlane.xyz/message/${messageId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-1"
              >
                Track on Hyperlane Explorer <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Re-exported for convenience if a parent wants the token list without importing the config directly.
export { BRIDGE_TOKENS };

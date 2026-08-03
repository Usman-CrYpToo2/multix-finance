import { CONTRACT_ADDRESSES } from '@/constants/addresses';

// Hyperlane warp-route wiring for the cross-chain bridge page.
// Routes deployed per hyperlaneCCT_walkthrough.md - Collateral on Somnia
// (wraps the real MultiX Stablecoin), Synthetic HypERC20 on Sepolia.
// Domain IDs confirmed on-chain via each Mailbox's `localDomain()` - they
// happen to equal the chain ID for both these testnets.

export type ChainKey = 'somnia' | 'sepolia';

export interface BridgeChain {
  key: ChainKey;
  chainId: number;
  domainId: number;
  name: string;
  nativeSymbol: string;
  letter: string;
  color: string; // tailwind bg-* class for the chain badge
}

export const BRIDGE_CHAINS: BridgeChain[] = [
  { key: 'somnia', chainId: 50312, domainId: 50312, name: 'Somnia Testnet', nativeSymbol: 'STT', letter: 'S', color: 'bg-violet-500' },
  { key: 'sepolia', chainId: 11155111, domainId: 11155111, name: 'Ethereum Sepolia', nativeSymbol: 'ETH', letter: 'E', color: 'bg-indigo-500' },
];

export type BridgeTokenId = 'GBP' | 'USD';

export interface BridgeToken {
  id: BridgeTokenId;
  symbol: string;
  name: string;
  color: string; // tailwind bg-* class for the token badge
  /** ERC20 the user actually holds/sees a balance of on each chain. */
  addresses: Partial<Record<ChainKey, `0x${string}`>>;
  /**
   * Hyperlane TokenRouter contract to call `transferRemote`/`quoteGasPayment` on.
   * On Somnia this is the HypERC20Collateral wrapper (different from `addresses.somnia`,
   * which is the underlying Stablecoin). On Sepolia the synthetic HypERC20 IS the
   * router, so it's the same address as `addresses.sepolia`.
   */
  routers: Partial<Record<ChainKey, `0x${string}`>>;
}

export const BRIDGE_TOKENS: BridgeToken[] = [
  {
    id: 'GBP',
    symbol: 'GBP',
    name: 'MultiX GBP Stablecoin',
    color: 'bg-pink-500',
    addresses: {
      somnia: CONTRACT_ADDRESSES.GBP_STABLE as `0x${string}`,
      sepolia: '0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16',
    },
    routers: {
      somnia: '0xDB51C9E44423343044a808c99fAF20766013Ff91',
      sepolia: '0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16',
    },
  },
  {
    id: 'USD',
    symbol: 'USD',
    name: 'MultiX USD Stablecoin',
    color: 'bg-emerald-500',
    addresses: {
      somnia: CONTRACT_ADDRESSES.USD_Stable as `0x${string}`,
      sepolia: '0x71fEe8094606B633a02e17Ed5e27C3A770f00e8b',
    },
    routers: {
      somnia: '0x4Cd08266375122fD5E5220e128F16b0aaF71580e',
      sepolia: '0x71fEe8094606B633a02e17Ed5e27C3A770f00e8b',
    },
  },
];

export const getChain = (key: ChainKey) => BRIDGE_CHAINS.find((c) => c.key === key)!;
export const getToken = (id: BridgeTokenId) => BRIDGE_TOKENS.find((t) => t.id === id)!;

/** True when bridging FROM this chain requires an ERC20 approve() before transferRemote (i.e. the collateral side). */
export const isCollateralSide = (tokenId: BridgeTokenId, chainKey: ChainKey) => {
  const token = getToken(tokenId);
  return token.addresses[chainKey] !== token.routers[chainKey];
};

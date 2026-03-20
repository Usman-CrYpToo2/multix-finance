export type Asset = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  totalDeposited: string;
  depositedUsd: string;
  totalMinted: string;
  mintedUsd: string;
  safeLtv: string;
  maxLtv: string;
  isCrossChain: boolean;
  walletBalance?: string;
  supplyApy?: string;
  debtAmount?: string;
};
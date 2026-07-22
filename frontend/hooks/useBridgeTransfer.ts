import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { formatUnits, pad, type Address } from 'viem';
import {
  BridgeTokenId,
  ChainKey,
  getChain,
  getToken,
  isCollateralSide,
} from '@/constants/bridgeConfig';

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

export const tokenRouterAbi = [
  { type: 'function', name: 'transferRemote', stateMutability: 'payable', inputs: [{ name: '_destination', type: 'uint32' }, { name: '_recipient', type: 'bytes32' }, { name: '_amountOrId', type: 'uint256' }], outputs: [{ name: 'messageId', type: 'bytes32' }] },
  { type: 'function', name: 'quoteGasPayment', stateMutability: 'view', inputs: [{ name: '_destination', type: 'uint32' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const addressToBytes32 = (address: Address) => pad(address, { size: 32 });

/** Reads a wallet's balance + decimals for a token on a specific bridge chain. */
export const useChainTokenBalance = (chainKey: ChainKey, tokenId: BridgeTokenId, address: Address | undefined) => {
  const chain = getChain(chainKey);
  const token = getToken(tokenId);
  const tokenAddress = token.addresses[chainKey];

  const { data, refetch } = useReadContracts({
    contracts: [
      { chainId: chain.chainId, address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined },
      { chainId: chain.chainId, address: tokenAddress, abi: erc20Abi, functionName: 'decimals' },
    ],
    query: { enabled: Boolean(address && tokenAddress) },
  });

  if (!tokenAddress) return { raw: undefined, decimals: 18, formatted: '—', available: false, refetch };

  const rawBalance = data?.[0]?.result as bigint | undefined;
  const decimals = (data?.[1]?.result as number | undefined) ?? 18;

  if (rawBalance === undefined) return { raw: undefined, decimals, formatted: '0.00', available: true, refetch };

  return {
    raw: rawBalance,
    decimals,
    formatted: Number(formatUnits(rawBalance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    available: true,
    refetch,
  };
};

type UseBridgeTransferArgs = {
  tokenId: BridgeTokenId;
  sourceChain: ChainKey;
  destChain: ChainKey;
  amountWei: bigint | undefined;
  recipient: Address | undefined;
};

/** Drives the approve -> transferRemote flow for a Hyperlane warp-route transfer. */
export const useBridgeTransfer = ({ tokenId, sourceChain, destChain, amountWei, recipient }: UseBridgeTransferArgs) => {
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [switchError, setSwitchError] = useState<Error | null>(null);
  const token = getToken(tokenId);
  const source = getChain(sourceChain);
  const dest = getChain(destChain);

  const routerAddress = token.routers[sourceChain];
  const needsApproval = isCollateralSide(tokenId, sourceChain);
  const spendTokenAddress = token.addresses[sourceChain];

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: source.chainId,
    address: spendTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && routerAddress ? [address, routerAddress] : undefined,
    query: { enabled: Boolean(needsApproval && address && routerAddress && spendTokenAddress) },
  });

  const { data: gasQuote } = useReadContract({
    chainId: source.chainId,
    address: routerAddress,
    abi: tokenRouterAbi,
    functionName: 'quoteGasPayment',
    args: [dest.domainId],
    query: { enabled: Boolean(routerAddress) },
  });

  const approveWrite = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveWrite.data });

  const transferWrite = useWriteContract();
  const transferReceipt = useWaitForTransactionReceipt({ hash: transferWrite.data });

  useEffect(() => {
    if (approveReceipt.isSuccess) refetchAllowance();
  }, [approveReceipt.isSuccess, refetchAllowance]);

  const requiresApproval = useMemo(() => {
    if (!needsApproval) return false;
    if (amountWei === undefined) return false;
    if (allowance === undefined) return true;
    return (allowance as bigint) < amountWei;
  }, [needsApproval, amountWei, allowance]);

  /** Switches the connected wallet to the source chain first if it's on the wrong network, so the write below doesn't silently no-op. */
  const ensureOnSourceChain = async () => {
    if (connectedChainId === source.chainId) return true;
    try {
      setSwitchError(null);
      await switchChainAsync({ chainId: source.chainId });
      return true;
    } catch (err) {
      setSwitchError(err as Error);
      return false;
    }
  };

  const approve = async () => {
    if (!routerAddress || !spendTokenAddress || amountWei === undefined) return;
    if (!(await ensureOnSourceChain())) return;
    approveWrite.writeContract({
      chainId: source.chainId,
      address: spendTokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [routerAddress, amountWei],
    });
  };

  const transfer = async () => {
    if (!routerAddress || !recipient || amountWei === undefined || gasQuote === undefined) return;
    if (!(await ensureOnSourceChain())) return;
    transferWrite.writeContract({
      chainId: source.chainId,
      address: routerAddress,
      abi: tokenRouterAbi,
      functionName: 'transferRemote',
      args: [dest.domainId, addressToBytes32(recipient), amountWei],
      value: gasQuote as bigint,
    });
  };

  return {
    requiresApproval,
    gasQuote: gasQuote as bigint | undefined,
    approve,
    isApproving: approveWrite.isPending || approveReceipt.isLoading,
    approveSuccess: approveReceipt.isSuccess,
    transfer,
    isTransferring: transferWrite.isPending || transferReceipt.isLoading,
    transferSuccess: transferReceipt.isSuccess,
    transferHash: transferWrite.data,
    error: switchError ?? approveWrite.error ?? transferWrite.error ?? null,
    reset: () => {
      setSwitchError(null);
      approveWrite.reset();
      transferWrite.reset();
    },
  };
};

export const useBridgeAmountState = () => {
  const [amount, setAmount] = useState('');
  return { amount, setAmount };
};

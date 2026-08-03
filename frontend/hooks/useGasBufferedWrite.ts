import { useCallback } from 'react';
import { usePublicClient, useWriteContract } from 'wagmi';
import type { Abi, Address } from 'viem';

type WriteParams = {
  chainId: number;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  account?: Address;
};

/**
 * Somnia testnet only exposes one public RPC (dream-rpc.somnia.network), which the
 * connected wallet also uses for its own `eth_estimateGas` call before showing the
 * "network fee" on the confirm screen. That single endpoint intermittently rate-limits
 * or times out, which is why MetaMask sometimes shows "Network fee Unavailable" and
 * then "fixes itself" once the endpoint recovers - it's the wallet's own estimate
 * failing, not our transaction. Estimating gas ourselves first (with a couple of
 * retries) and passing an explicit `gas` limit lets the wallet skip that step.
 */
export const useGasBufferedWrite = (chainId: number) => {
  const publicClient = usePublicClient({ chainId });
  const { writeContract, ...rest } = useWriteContract();

  const writeWithGas = useCallback(
    async (params: WriteParams) => {
      let gas: bigint | undefined;

      if (publicClient) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const estimated = await publicClient.estimateContractGas({
              address: params.address,
              abi: params.abi,
              functionName: params.functionName,
              args: params.args,
              value: params.value,
              account: params.account,
            } as Parameters<typeof publicClient.estimateContractGas>[0]);
            gas = (estimated * BigInt(130)) / BigInt(100); // 30% safety buffer
            break;
          } catch {
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          }
        }
      }

      writeContract({ ...params, ...(gas !== undefined ? { gas } : {}) } as Parameters<typeof writeContract>[0]);
    },
    [publicClient, writeContract]
  );

  return { writeWithGas, writeContract, ...rest };
};

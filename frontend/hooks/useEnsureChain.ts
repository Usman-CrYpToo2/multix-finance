import { useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';

/**
 * wagmi's writeContract asserts the wallet is already on the given chainId and
 * throws immediately (no prompt) if it isn't - it does not switch for you. Call
 * `ensure()` before every writeContract to switch first, so a wallet left on
 * the wrong network after a bridge transfer doesn't cause silent write failures.
 */
export function useEnsureChain(targetChainId: number) {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<Error | null>(null);

  const ensure = async () => {
    if (chainId === targetChainId) return true;
    try {
      setError(null);
      await switchChainAsync({ chainId: targetChainId });
      return true;
    } catch (err) {
      setError(err as Error);
      return false;
    }
  };

  return { ensure, switchError: error, clearSwitchError: () => setError(null) };
}

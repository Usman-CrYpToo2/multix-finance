// The MultiX protocol (Factory/Router/CDPEngine/Stablecoins) lives on Somnia Testnet, or on a
// local anvil node when the app is started with NEXT_PUBLIC_NETWORK=local (`npm run dev:local`,
// after `./deploy-local.sh`). Reads/writes against it must pin PROTOCOL_CHAIN_ID explicitly -
// otherwise wagmi falls back to whatever network the wallet happens to be connected to, which
// breaks after a bridge transfer switches the wallet onto Sepolia.
export const IS_LOCAL_NETWORK = process.env.NEXT_PUBLIC_NETWORK === 'local';

export const SOMNIA_CHAIN_ID = 50312;
export const ANVIL_CHAIN_ID = 31337;

export const PROTOCOL_CHAIN_ID = IS_LOCAL_NETWORK ? ANVIL_CHAIN_ID : SOMNIA_CHAIN_ID;
export const PROTOCOL_NETWORK_NAME = IS_LOCAL_NETWORK ? 'Anvil (local)' : 'Somnia Testnet';

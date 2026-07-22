// The MultiX protocol (Factory/Router/CDPEngine/Stablecoins) only lives on Somnia Testnet.
// Reads/writes against it must pin this chainId explicitly - otherwise wagmi falls back to
// whatever network the wallet happens to be connected to, which breaks after a bridge transfer
// switches the wallet onto Sepolia.
export const SOMNIA_CHAIN_ID = 50312;

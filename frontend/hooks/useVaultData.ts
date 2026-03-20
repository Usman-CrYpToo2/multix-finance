import { useState, useEffect } from 'react';
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi, parseEther, formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';

// --- Constants & ABIs ---
export const SUPPORTED_ASSETS = {
  GBP: {
    id: 'GBP',
    symbol: 'SPK',
    poolAddress: CONTRACT_ADDRESSES.GBP_POOL,
    stableAddress: CONTRACT_ADDRESSES.GBP_STABLE,
    price: 1.30, // We will make this dynamic from Oracle soon
  },

  USD: {
    id: 'USD',
    symbol: 'USD',
    poolAddress: CONTRACT_ADDRESSES.USD_Pool,
    stableAddress: CONTRACT_ADDRESSES.USD_Stable,
    price: 1.0,
  }
} as const;

type AssetKey = keyof typeof SUPPORTED_ASSETS;

const COLLATERAL_PRICE = 1000;

const routerAbi = [
  { type: 'function', name: 'depositCollateral', stateMutability: 'nonpayable', inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'receiver', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'borrowFiat', stateMutability: 'nonpayable', inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'stablecoinAmount', type: 'uint256' }], outputs: [] }
] as const;

const cdpAbi = [
  { type: 'function', name: 'ltvConfig', stateMutability: 'view', inputs: [], outputs: [{ name: 'safeLtvBp', type: 'uint16' }, { name: 'liquidationLtvBp', type: 'uint16' }, { name: 'liquidationPenaltyBp', type: 'uint16' }] },
  { type: 'function', name: 'getUserDebt', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserCollateral', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'borrowRatePerSecond', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' } // NEW API ADDED
] as const;

export function useVaultData() {
  const { address, isConnected } = useConnection();

  // --- UI State ---
  const [selectedAssetId, setSelectedAssetId] = useState<AssetKey>('GBP');
  const [depositAmount, setDepositAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [autoRebalance, setAutoRebalance] = useState(false);
  const [txType, setTxType] = useState<'none' | 'approve' | 'deposit' | 'borrow'>('none');

  const activeAsset = SUPPORTED_ASSETS[selectedAssetId];

  // --- Blockchain Reads ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'allowance', args: address ? [address, CONTRACT_ADDRESSES.ROUTER] : undefined, query: { enabled: !!address }
  });

  const { data: wethBalance, refetch: refetchWethBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  const { data: ltvConfigData } = useReadContract({
    address: activeAsset.poolAddress, abi: cdpAbi, functionName: 'ltvConfig',
  });

  const { data: rawCollateral, refetch: refetchCollateral } = useReadContract({
    address: activeAsset.poolAddress, abi: cdpAbi, functionName: 'getUserCollateral', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  const { data: rawDebt, refetch: refetchDebt } = useReadContract({
    address: activeAsset.poolAddress, abi: cdpAbi, functionName: 'getUserDebt', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  const { data: rawBorrowRate } = useReadContract({
    address: activeAsset.poolAddress, abi: cdpAbi, functionName: 'borrowRatePerSecond',
  });

  // --- Write Contracts & Wait ---
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // --- Math & Logic ---
  const formattedBalance = wethBalance ? formatEther(wethBalance) : '0';
  const existingCollateral = rawCollateral ? Number(formatEther(rawCollateral - BigInt(10000))) : 0;
  const existingDebt = rawDebt ? Number(formatEther(rawDebt)) : 0;

  // Calculate Borrow Rate (APR)
  const SECONDS_IN_YEAR = 31536000;
  const borrowAPR = rawBorrowRate ? (Number(rawBorrowRate) * SECONDS_IN_YEAR) / 1e16 : 0;

  const numDeposit = Number(depositAmount) || 0;
  const numBorrow = Number(borrowAmount) || 0;

  const totalProjectedCollateral = existingCollateral + numDeposit;
  const totalProjectedDebt = existingDebt + numBorrow;

  const totalCollateralValue = totalProjectedCollateral * COLLATERAL_PRICE;
  // Dynamic price based on active asset!
  const totalDebtValue = totalProjectedDebt * activeAsset.price;

  const currentLTV = totalCollateralValue > 0 ? (totalDebtValue / totalCollateralValue) * 100 : 0;
  const SAFE_LTV = ltvConfigData ? Number(ltvConfigData[0]) / 100 : 70.0;
  const MAX_LTV = ltvConfigData ? Number(ltvConfigData[1]) / 100 : 82.5;

  const existingCollateralValue = existingCollateral * COLLATERAL_PRICE;
  const existingDebtValue = existingDebt * activeAsset.price;

  const currentHF = (existingDebt > 0 && existingCollateral > 0)
    ? (((existingCollateral * MAX_LTV) / 100 )* COLLATERAL_PRICE) / (existingDebt * activeAsset.price)
    : 0;

  let hfStatusText = 'Danger';
  if (currentHF >= 2.5) hfStatusText = 'Safe';
  else if (currentHF >= 1.5) hfStatusText = 'Moderate';

  const maxTotalDebtUSD = totalCollateralValue * (SAFE_LTV / 100);
  const maxTotalDebtSPK = maxTotalDebtUSD / activeAsset.price;
  const maxBorrowableSPK = Math.max(0, maxTotalDebtSPK - existingDebt );

  const parsedDeposit = depositAmount ? parseEther(depositAmount) : BigInt(0);
  const parsedBorrow = borrowAmount ? parseEther(borrowAmount) : BigInt(0);
  const needsApproval = allowance !== undefined && parsedDeposit > allowance;
  const isExceedingBalance = numDeposit > Number(formattedBalance);
  const isBorrowingTooMuch = currentLTV >= MAX_LTV;

  // --- Flow Management ---
  useEffect(() => {
    if (isConfirmed) {
      if (txType === 'approve') refetchAllowance();
      else if (txType === 'deposit') { refetchWethBalance(); refetchCollateral(); setDepositAmount(''); refetchAllowance(); }
      else if (txType === 'borrow') { refetchDebt(); setBorrowAmount(''); }
      setTxType('none');
    }
  }, [isConfirmed, txType, refetchAllowance, refetchWethBalance, refetchCollateral, refetchDebt]);

  // --- Handlers ---
  const handleMaxClick = () => { if (Number(formattedBalance) > 0) setDepositAmount(formattedBalance); };
  const handleDepositChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) setDepositAmount(val);
  };

  const handleMaxBorrowClick = () => {
    if (maxBorrowableSPK > 0) setBorrowAmount((Math.floor(maxBorrowableSPK * 100) / 100).toString());
  };
  const handleBorrowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) setBorrowAmount(val);
  };

  // --- Dynamic Button State Machine ---
  const getButtonState = () => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true, action: () => { } };
    if (isPending || isConfirming) return { text: 'Confirming in Wallet...', disabled: true, action: () => { } };
    if (isExceedingBalance) return { text: 'Insufficient WETH Balance', disabled: true, action: () => { } };
    if (isBorrowingTooMuch) return { text: 'LTV Too High!', disabled: true, action: () => { } };
    if (numDeposit === 0 && numBorrow === 0) return { text: 'Enter Amounts', disabled: true, action: () => { } };

    if (numDeposit > 0) {
      if (needsApproval) {
        return {
          text: '1. Approve WETH',
          disabled: false,
          action: () => {
            setTxType('approve');
            writeContract({ address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'approve', args: [CONTRACT_ADDRESSES.ROUTER, parsedDeposit] });
          }
        };
      }
      return {
        text: '2. Deposit WETH',
        disabled: false,
        action: () => {
          setTxType('deposit');
          writeContract({ address: CONTRACT_ADDRESSES.ROUTER, abi: routerAbi, functionName: 'depositCollateral', args: [activeAsset.stableAddress, address!, parsedDeposit] });
        }
      };
    }

    return {
      text: `3. Borrow ${activeAsset.symbol}`,
      disabled: false, 
      action: () => {
        setTxType('borrow');
        writeContract({ address: CONTRACT_ADDRESSES.ROUTER, abi: routerAbi, functionName: 'borrowFiat', args: [activeAsset.stableAddress, parsedBorrow] });
      }
    };
  };

  const { text: buttonText, disabled: buttonDisabled, action: buttonAction } = getButtonState();
  
  return {
    depositAmount, borrowAmount, autoRebalance, setAutoRebalance, formattedBalance,
    totalCollateralValue, totalDebtValue, currentLTV, SAFE_LTV, MAX_LTV, currentHF, hfStatusText,
    maxBorrowableSPK, isExceedingBalance, isBorrowingTooMuch, buttonText, buttonAction,
    buttonDisabled, isConfirmed, txType, handleMaxClick, handleDepositChange, handleMaxBorrowClick, handleBorrowChange,
    SUPPORTED_ASSETS, selectedAssetId, setSelectedAssetId, activeAsset, borrowAPR, existingCollateral, existingDebt,
     existingCollateralValue, existingDebtValue
  };
}
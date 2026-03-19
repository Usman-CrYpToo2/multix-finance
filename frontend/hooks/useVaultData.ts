import { useState, useEffect } from 'react';
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi, parseEther, formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/constants/addresses';

// --- Constants & ABIs ---
const COLLATERAL_PRICE = 1000;
const STABLECOIN_PRICE = 1.3;

const routerAbi = [
  {
    type: 'function',
    name: 'depositCollateral',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'receiver', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'borrowFiat',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'stableCoin', type: 'address' }, { name: 'stablecoinAmount', type: 'uint256' }],
    outputs: [],
  }
] as const;

const cdpAbi = [
  { type: 'function', name: 'ltvConfig', stateMutability: 'view', inputs: [], outputs: [{ name: 'safeLtvBp', type: 'uint16' }, { name: 'liquidationLtvBp', type: 'uint16' }, { name: 'liquidationPenaltyBp', type: 'uint16' }] },
  { type: 'function', name: 'getUserDebt', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserCollateral', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }
] as const;

export function useVaultData() {
  const { address, isConnected } = useConnection();

  // --- UI State ---
  const [depositAmount, setDepositAmount] = useState('1');
  const [borrowAmount, setBorrowAmount] = useState('100');
  const [autoRebalance, setAutoRebalance] = useState(false);
  const [txType, setTxType] = useState<'none' | 'approve' | 'deposit' | 'borrow'>('none');

  // --- Blockchain Reads ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'allowance', args: address ? [address, CONTRACT_ADDRESSES.ROUTER] : undefined, query: { enabled: !!address }
  });

  const { data: wethBalance, refetch: refetchWethBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  const { data: ltvConfigData } = useReadContract({
    address: CONTRACT_ADDRESSES.GBP_POOL, abi: cdpAbi, functionName: 'ltvConfig',
  });

  const { data: rawCollateral, refetch: refetchCollateral } = useReadContract({
    address: CONTRACT_ADDRESSES.GBP_POOL, abi: cdpAbi, functionName: 'getUserCollateral', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  const { data: rawDebt, refetch: refetchDebt } = useReadContract({
    address: CONTRACT_ADDRESSES.GBP_POOL, abi: cdpAbi, functionName: 'getUserDebt', args: address ? [address] : undefined, query: { enabled: !!address }
  });

  // --- Write Contracts & Wait ---
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // --- Math & Logic ---
  const formattedBalance = wethBalance ? formatEther(wethBalance) : '0';
  const existingCollateral = rawCollateral ? Number(formatEther(rawCollateral)) : 0;
  const existingDebt = rawDebt ? Number(formatEther(rawDebt)) : 0;

  const numDeposit = Number(depositAmount) || 0;
  const numBorrow = Number(borrowAmount) || 0;

  const totalProjectedCollateral = existingCollateral + numDeposit;
  const totalProjectedDebt = existingDebt + numBorrow;

  const totalCollateralValue = totalProjectedCollateral * COLLATERAL_PRICE;
  const totalDebtValue = totalProjectedDebt * STABLECOIN_PRICE;

  const currentLTV = totalCollateralValue > 0 ? (totalDebtValue / totalCollateralValue) * 100 : 0;
  const SAFE_LTV = ltvConfigData ? Number(ltvConfigData[0]) / 100 : 70.0;
  const MAX_LTV = ltvConfigData ? Number(ltvConfigData[1]) / 100 : 82.5;

  const currentHF = (existingDebt > 0 && existingCollateral > 0)
    ? (existingCollateral * COLLATERAL_PRICE) / (existingDebt * STABLECOIN_PRICE)
    : 0;

  let hfStatusText = 'Danger';
  if (currentHF >= 2.5) hfStatusText = 'Safe';
  else if (currentHF >= 1.5) hfStatusText = 'Moderate';

  const maxTotalDebtUSD = totalCollateralValue * (SAFE_LTV / 100);
  const maxTotalDebtSPK = maxTotalDebtUSD / STABLECOIN_PRICE;
  const maxBorrowableSPK = Math.max(0, maxTotalDebtSPK - existingDebt);

  const parsedDeposit = depositAmount ? parseEther(depositAmount) : BigInt(0);
  const parsedBorrow = borrowAmount ? parseEther(borrowAmount) : BigInt(0);
  const needsApproval = allowance !== undefined && parsedDeposit > allowance;
  const isExceedingBalance = numDeposit > Number(formattedBalance);
  const isBorrowingTooMuch = currentLTV >= MAX_LTV;

  // --- Flow Management ---
  useEffect(() => {
    if (isConfirmed) {
      if (txType === 'approve') refetchAllowance();
      else if (txType === 'deposit') { refetchWethBalance(); refetchCollateral(); setDepositAmount(''); } 
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
  let buttonText = 'Enter Amounts';
  let buttonAction = () => { };
  let buttonDisabled = true;

  if (!isConnected) {
    buttonText = 'Connect Wallet';
  } else if (isPending || isConfirming) {
    buttonText = 'Confirming in Wallet...';
  } else if (isExceedingBalance) {
    buttonText = 'Insufficient WETH Balance';
    buttonDisabled = true;
  } else if (isBorrowingTooMuch) {
    buttonText = 'LTV Too High!';
    buttonDisabled = true;
  } else if (numDeposit > 0) {
    if (needsApproval) {
      buttonText = '1. Approve WETH';
      buttonDisabled = false;
      buttonAction = () => {
        setTxType('approve');
        writeContract({ address: CONTRACT_ADDRESSES.WETH, abi: erc20Abi, functionName: 'approve', args: [CONTRACT_ADDRESSES.ROUTER, parsedDeposit] });
      };
    } else {
      buttonText = '2. Deposit WETH';
      buttonDisabled = false;
      buttonAction = () => {
        setTxType('deposit');
        writeContract({ address: CONTRACT_ADDRESSES.ROUTER, abi: routerAbi, functionName: 'depositCollateral', args: [CONTRACT_ADDRESSES.GBP_STABLE, address!, parsedDeposit] });
      };
    }
  } else if (numBorrow > 0) {
    buttonText = '3. Borrow SPK';
    buttonDisabled = currentLTV >= MAX_LTV;
    buttonAction = () => {
      setTxType('borrow');
      writeContract({ address: CONTRACT_ADDRESSES.ROUTER, abi: routerAbi, functionName: 'borrowFiat', args: [CONTRACT_ADDRESSES.GBP_STABLE, parsedBorrow] });
    };
  }

  // Pass everything back to the UI
  return {
    depositAmount, borrowAmount, autoRebalance, setAutoRebalance, formattedBalance,
    totalCollateralValue, totalDebtValue, currentLTV, SAFE_LTV, MAX_LTV, currentHF, hfStatusText,
    maxBorrowableSPK, isExceedingBalance, isBorrowingTooMuch, buttonText, buttonAction,
    buttonDisabled, isConfirmed, txType, handleMaxClick, handleDepositChange, handleMaxBorrowClick, handleBorrowChange
  };
}
import { CONTRACT_ADDRESSES as SOMNIA_ADDRESSES } from '@/constants/addresses';
import { CONTRACT_ADDRESSES as LOCAL_ADDRESSES } from '@/constants/addresses.local';
import { IS_LOCAL_NETWORK } from '@/constants/chain';

// Protocol addresses for the active network (see constants/chain.ts). Both source
// files are generated - addresses.ts by deploy.sh, addresses.local.ts by deploy-local.sh.
export const CONTRACT_ADDRESSES = IS_LOCAL_NETWORK ? LOCAL_ADDRESSES : SOMNIA_ADDRESSES;

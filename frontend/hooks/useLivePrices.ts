// 1. Fetch WETH
export const getWethPrice = async (): Promise<number> => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=weth&vs_currencies=usd');
      const data = await res.json();
      return data.weth.usd; 
    } catch (e) {
      console.error("WETH API Error", e);
      return 3000; // Safe fallback price
    }
};
  
// 2. Fetch GBP
export const getGbpPrice = async (): Promise<number> => {
    try {
        const res = await fetch('https://api.frankfurter.app/latest?from=GBP&to=USD');
        const data = await res.json();
        return data.rates.USD; 
    } catch (e) {
        console.error("GBP API Error", e);
        return 1.30; // Safe fallback price
    }
};
  
// 3. Fetch USD Stablecoin Peg
export const getUsdPrice = async (): Promise<number> => {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd');
        const data = await res.json();
        return data['usd-coin'].usd; 
    } catch (e) {
        console.error("USD API Error", e);
        return 1.00; // Safe fallback price
    }
};
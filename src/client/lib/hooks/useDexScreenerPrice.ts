import { useState, useEffect, useCallback } from 'react';

export interface TokenPrice {
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  pairAddress?: string;
}

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

export const useDexScreenerPrice = (tokenMints: string[], refreshInterval = 5000) => {
  const [tokenPrices, setTokenPrices] = useState<Record<string, TokenPrice>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchTokenPrice = useCallback(async (mintAddress: string): Promise<TokenPrice | null> => {
    try {
      const url = `${DEXSCREENER_API}/token/${mintAddress}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`DexScreener API returned status ${response.status} for token ${mintAddress}`);
        return null;
      }

      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          price: parseFloat(pair.priceUsd) || 0,
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          marketCap: parseFloat(pair.marketCap?.usd || 0),
          pairAddress: pair.pairAddress
        };
      }
      return null;
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.warn(`Failed to fetch price for token ${mintAddress}:`, err.message);
      }
      return null;
    }
  }, []);

  const fetchAllPrices = useCallback(async () => {
    if (!tokenMints || tokenMints.length === 0) return;

    setLoading(true);
    setError(null);
    const prices: Record<string, TokenPrice> = {};

    try {
      const results = await Promise.all(
        tokenMints.map(mint => fetchTokenPrice(mint))
      );

      tokenMints.forEach((mint, index) => {
        if (results[index]) {
          prices[mint] = results[index] as TokenPrice;
        }
      });

      setTokenPrices(prices);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, [tokenMints, fetchTokenPrice]);

  useEffect(() => {
    fetchAllPrices();
    const intervalId = setInterval(fetchAllPrices, refreshInterval);
    return () => clearInterval(intervalId);
  }, [fetchAllPrices, refreshInterval]);

  return {
    tokenPrices,
    loading,
    error,
    lastUpdated,
    refetch: fetchAllPrices
  };
};

import { useState, useEffect, useCallback } from 'react';

export interface TokenPrice {
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  pairAddress?: string;
  priceChange?: {
    h24: number;
  };
  volume?: {
    h24: number;
  };
  liquidityUsd?: number;
}

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

export const useDexScreenerPrice = (tokenMints: string[], refreshInterval = 5000) => {
  const [tokenPrices, setTokenPrices] = useState<Record<string, TokenPrice>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchTokenPrice = useCallback(async (mintAddress: string): Promise<TokenPrice | null> => {
    // Try multiple endpoints in order of preference
    const endpoints = [
      `${DEXSCREENER_API}/tokens/${mintAddress}`,
      `${DEXSCREENER_API}/search?q=${mintAddress}`
    ];

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            console.warn(`Token ${mintAddress} not found on DexScreener`);
            continue;
          }
          console.warn(`DexScreener API returned status ${response.status} for token ${mintAddress}`);
          continue;
        }

        const data = await response.json();
        
        // Handle different response formats
        let pairs = [];
        
        // Format 1: Direct pairs array
        if (data.pairs && Array.isArray(data.pairs)) {
          pairs = data.pairs;
        } 
        // Format 2: Data wrapper
        else if (data.data && data.data.pairs && Array.isArray(data.data.pairs)) {
          pairs = data.data.pairs;
        }
        // Format 3: Single pair object
        else if (data.pair) {
          pairs = [data.pair];
        }
        // Format 4: Search response
        else if (data.data && Array.isArray(data.data)) {
          // Search results might be in data array
          for (const item of data.data) {
            if (item.pairs && Array.isArray(item.pairs)) {
              pairs = pairs.concat(item.pairs);
            }
          }
        }

        if (pairs.length > 0) {
          // Sort by liquidity to get the most liquid pair
          pairs.sort((a: any, b: any) => {
            const liqA = parseFloat(a.liquidity?.usd) || 0;
            const liqB = parseFloat(b.liquidity?.usd) || 0;
            return liqB - liqA;
          });

          const pair = pairs[0];
          
          // Extract price data with fallbacks
          const price = parseFloat(pair.priceUsd) || parseFloat(pair.price) || 0;
          const change24h = parseFloat(pair.priceChange?.h24) || 
                           parseFloat(pair.priceChange24h) || 
                           parseFloat(pair.change24h) || 0;
          const volume24h = parseFloat(pair.volume?.h24) || 
                           parseFloat(pair.volume24h) || 
                           parseFloat(pair.volume) || 0;
          const liquidity = parseFloat(pair.liquidity?.usd) || 
                           parseFloat(pair.liquidityUsd) || 
                           parseFloat(pair.liquidity) || 0;
          const marketCap = parseFloat(pair.marketCap?.usd) || 
                           parseFloat(pair.marketCap) || 
                           parseFloat(pair.fdv) || 0;

          const priceData: TokenPrice = {
            price,
            change24h,
            volume24h,
            liquidity,
            marketCap: marketCap || undefined,
            pairAddress: pair.pairAddress || pair.id || pair.address || pair.pairId,
            priceChange: {
              h24: change24h
            },
            volume: {
              h24: volume24h
            },
            liquidityUsd: liquidity
          };

          return priceData;
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn(`Failed to fetch price for token ${mintAddress}:`, err.message);
        }
        continue; // Try next endpoint
      }
    }

    return null;
  }, []);

  const fetchAllPrices = useCallback(async () => {
    if (!tokenMints || tokenMints.length === 0) {
      setTokenPrices({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const prices: Record<string, TokenPrice> = {};
    let failedCount = 0;

    try {
      // Process tokens in batches to avoid rate limiting
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < tokenMints.length; i += batchSize) {
        batches.push(tokenMints.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const results = await Promise.all(
          batch.map(mint => fetchTokenPrice(mint))
        );

        batch.forEach((mint, index) => {
          if (results[index]) {
            prices[mint] = results[index] as TokenPrice;
          } else {
            failedCount++;
          }
        });

        // Small delay between batches to avoid rate limiting
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setTokenPrices(prices);
      setLastUpdated(new Date());
      
      // Set error if all tokens failed
      if (failedCount === tokenMints.length) {
        setError('Failed to fetch prices for all tokens');
      } else if (failedCount > 0) {
        setError(`${failedCount} token(s) could not be fetched`);
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, [tokenMints, fetchTokenPrice]);

  useEffect(() => {
    // Initial fetch
    fetchAllPrices();

    // Set up interval
    const intervalId = setInterval(fetchAllPrices, refreshInterval);

    // Cleanup
    return () => {
      clearInterval(intervalId);
    };
  }, [fetchAllPrices, refreshInterval]);

  // Helper function to get price for a specific token
  const getTokenPrice = useCallback((mintAddress: string): TokenPrice | undefined => {
    return tokenPrices[mintAddress];
  }, [tokenPrices]);

  // Helper function to check if a token has price data
  const hasTokenPrice = useCallback((mintAddress: string): boolean => {
    return !!tokenPrices[mintAddress];
  }, [tokenPrices]);

  // Helper function to get all token addresses with prices
  const getTokensWithPrices = useCallback((): string[] => {
    return Object.keys(tokenPrices);
  }, [tokenPrices]);

  // Helper function to get formatted price string
  const getFormattedPrice = useCallback((mintAddress: string): string => {
    const priceData = tokenPrices[mintAddress];
    if (!priceData) return 'N/A';
    
    if (priceData.price < 0.0001) {
      return priceData.price.toExponential(4);
    } else if (priceData.price < 1) {
      return priceData.price.toFixed(6);
    } else if (priceData.price < 1000) {
      return priceData.price.toFixed(2);
    } else {
      return priceData.price.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    }
  }, [tokenPrices]);

  return {
    tokenPrices,
    loading,
    error,
    lastUpdated,
    refetch: fetchAllPrices,
    getTokenPrice,
    hasTokenPrice,
    getTokensWithPrices,
    getFormattedPrice
  };
};

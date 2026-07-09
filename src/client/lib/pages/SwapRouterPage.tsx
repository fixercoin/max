import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PublicKey } from '@solana/web3.js';
import { saveTransaction, getExplorerUrl } from '../transactionUtils';

const SwapRouterPage: React.FC = () => {
  const { wallet, dexClient, deployedTokens, pools, setPools } = useAppContext();
  const [fromToken, setFromToken] = useState<any>(null);
  const [toToken, setToToken] = useState<any>(null);
  const [swapAmount, setSwapAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [swapStatus, setSwapStatus] = useState('');
  const [selectedPool, setSelectedPool] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tokenPrices, setTokenPrices] = useState<Record<string, any>>({});
  const [selectedChartToken, setSelectedChartToken] = useState<string>('So11111111111111111111111111111111111111112');

  // Define base tokens - moved inside useMemo or defined as constant outside component
  const baseTokens = React.useMemo(() => [
    { symbol: 'USDC', mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', decimals: 6, price: 1.00, change24h: 0.05, volume: 1250000, logo: null },
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, price: 145.20, change24h: 2.5, volume: 890000, logo: null },
  ], []);

  // Create allTokens array after deployedTokens is available
  const allTokens = React.useMemo(() => {
    return [
      ...baseTokens,
      ...deployedTokens.map(t => ({
        symbol: t.symbol,
        mint: t.mint,
        decimals: t.decimals,
        price: Math.random() * 100,
        change24h: (Math.random() * 20) - 10,
        volume: Math.random() * 100000,
        logo: t.logo || null
      }))
    ];
  }, [baseTokens, deployedTokens]);

  // Fetch token prices from DexScreener API
  const fetchTokenPrice = async (mintAddress: string) => {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/token/${mintAddress}`);
      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          price: parseFloat(pair.priceUsd),
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          pairAddress: pair.pairAddress
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch price for token:', mintAddress, error);
      return null;
    }
  };

  // Fetch prices for all tokens
  useEffect(() => {
    const fetchAllPrices = async () => {
      const prices: Record<string, any> = {};
      for (const token of allTokens) {
        const priceData = await fetchTokenPrice(token.mint);
        if (priceData) {
          prices[token.mint] = priceData;
        }
      }
      setTokenPrices(prices);
    };
    
    if (allTokens.length > 0) {
      fetchAllPrices();
    }
  }, [allTokens]);

  // Update token objects with real-time prices
  const tokensWithPrices = React.useMemo(() => {
    return allTokens.map(token => ({
      ...token,
      price: tokenPrices[token.mint]?.price || token.price,
      change24h: tokenPrices[token.mint]?.change24h || token.change24h,
      volume24h: tokenPrices[token.mint]?.volume24h || token.volume,
      liquidity: tokenPrices[token.mint]?.liquidity || 0,
    }));
  }, [allTokens, tokenPrices]);

  // Filter tokens based on search query
  const filteredTokens = React.useMemo(() => {
    return tokensWithPrices.filter(token =>
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.mint.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tokensWithPrices, searchQuery]);

  // Find pool when tokens are selected and fetch real reserves
  useEffect(() => {
    if (fromToken && toToken) {
      const pool = pools.find(
        (p) =>
          (p.tokenA === fromToken.mint && p.tokenB === toToken.mint) ||
          (p.tokenA === toToken.mint && p.tokenB === fromToken.mint)
      );

      if (pool && dexClient) {
        dexClient.fetchPoolReserves(new PublicKey(pool.poolAddress)).then(poolData => {
          if (poolData) {
            const updatedPool = {
              ...pool,
              reserveA: poolData.reserveA?.toNumber?.() || poolData.reserveA || 0,
              reserveB: poolData.reserveB?.toNumber?.() || poolData.reserveB || 0,
              totalLp: poolData.lpSupply?.toNumber?.() || poolData.lpSupply || 0,
            };
            setSelectedPool(updatedPool);
            setEstimatedOutput('ENTER AMOUNT TO ESTIMATE');
          } else {
            setSelectedPool(pool);
            setEstimatedOutput('ENTER AMOUNT TO ESTIMATE');
          }
        }).catch(e => {
          console.error('Failed to fetch pool reserves:', e);
          setSelectedPool(pool);
          setEstimatedOutput('ENTER AMOUNT TO ESTIMATE');
        });
      } else {
        setSelectedPool(pool || null);
        if (!pool) {
          setEstimatedOutput('NO LIQUIDITY POOL FOUND FOR THIS PAIR');
        } else {
          setEstimatedOutput('ENTER AMOUNT TO ESTIMATE');
        }
      }
    }
  }, [fromToken, toToken, pools, dexClient]);

  // Estimate swap output
  const handleEstimateSwap = () => {
    if (!fromToken || !toToken || !selectedPool) {
      setEstimatedOutput('SELECT TOKENS AND ENSURE POOL EXISTS');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setEstimatedOutput('ENTER VALID AMOUNT');
      return;
    }

    const isAtoB = selectedPool.tokenA === fromToken.mint;
    const reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
    const reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;
    
    const rawAmountIn = amount * Math.pow(10, fromToken.decimals);
    
    const feeBps = selectedPool.fee;
    const feeMultiplier = (10000 - feeBps) / 10000;
    const amountInWithFee = rawAmountIn * feeMultiplier;
    
    const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    const amountOut = rawAmountOut / Math.pow(10, toToken.decimals);
    
    setEstimatedOutput(
      `ESTIMATED OUTPUT: ${amountOut.toFixed(6)} ${toToken.symbol}\n` +
      `FEE: ${feeBps / 100}%\n` +
      `LIQUIDITY: ${(reserveIn / Math.pow(10, fromToken.decimals)).toFixed(2)} ${fromToken.symbol} / ` +
      `${(reserveOut / Math.pow(10, toToken.decimals)).toFixed(2)} ${toToken.symbol}`
    );
    
    return amountOut;
  };

  // Execute swap
  const handleExecuteSwap = async () => {
    if (!wallet || !dexClient) {
      alert('CONNECT WALLET AND INITIALIZE DEX FIRST');
      return;
    }

    if (!fromToken || !toToken || !selectedPool) {
      alert('SELECT TOKENS AND ENSURE POOL EXISTS');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('ENTER VALID AMOUNT');
      return;
    }

    setSwapStatus('PREPARING SWAP...');

    try {
      const isAtoB = selectedPool.tokenA === fromToken.mint;
      const reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
      const reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;

      const rawAmountIn = amount * Math.pow(10, fromToken.decimals);
      const feeMultiplier = (10000 - selectedPool.fee) / 10000;
      const amountInWithFee = rawAmountIn * feeMultiplier;
      const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
      const minAmountOut = rawAmountOut * 0.99;

      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const tokenInPubkey = new PublicKey(fromToken.mint);
      const tokenOutPubkey = new PublicKey(toToken.mint);

      setSwapStatus('REQUESTING TRANSACTION SIGNATURE...');

      const txHash = await dexClient.swap(poolPubkey, tokenInPubkey, tokenOutPubkey, rawAmountIn, minAmountOut);

      setSwapStatus('CONFIRMING TRANSACTION ON BLOCKCHAIN...');

      const updatedPool = await dexClient.program.account.poolAccount.fetch(poolPubkey);
      const updatedPools = pools.map(p =>
        p.poolAddress === selectedPool.poolAddress
          ? {
              ...p,
              reserveA: updatedPool.reserveA,
              reserveB: updatedPool.reserveB,
              totalVolume: updatedPool.totalVolume,
              totalFeesCollected: updatedPool.totalFeesCollected
            }
          : p
      );
      setPools(updatedPools);

      const outputAmount = ((rawAmountOut / Math.pow(10, toToken.decimals))).toFixed(6);
      const explorerUrl = getExplorerUrl(txHash, 'mainnet');

      saveTransaction({
        id: Date.now().toString(),
        hash: txHash,
        type: 'swap',
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amount: amount.toString(),
        status: 'confirmed',
        timestamp: Date.now(),
        explorerUrl
      });

      setSwapStatus(
        `SWAP EXECUTED SUCCESSFULLY!\n` +
        `SENT: ${amount} ${fromToken.symbol}\n` +
        `RECEIVED: ${outputAmount} ${toToken.symbol}\n` +
        `FEE: ${selectedPool.fee / 100}%\n\n` +
        `VIEW ON EXPLORER: ${explorerUrl}`
      );

      setSwapAmount('');
      setEstimatedOutput('');

    } catch (e: any) {
      setSwapStatus(`SWAP FAILED: ${e.message}`);
      console.error('Swap error:', e);
    }
  };

  // Generate Birdeye chart URL
  const getBirdeyeChartUrl = (mintAddress: string) => {
    return `https://birdeye.so/token/${mintAddress}?chain=solana`;
  };

  // Generate Birdeye embed chart URL
  const getBirdeyeEmbedUrl = (mintAddress: string) => {
    return `https://birdeye.so/tv-widget/${mintAddress}?chain=solana&viewMode=price&chartInterval=1D&chartType=CandleStick`;
  };

  return (
    <div className="swap-router-three-columns">
      {/* LEFT COLUMN - TOKENS LIST WITH SEARCH - 20% */}
      <div className="left-column">
        <div className="column-header">TOKENS LIST</div>
        
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="SEARCH TOKENS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="tokens-list">
          {filteredTokens.length === 0 ? (
            <div className="empty-message">NO TOKENS FOUND</div>
          ) : (
            filteredTokens.map((token, idx) => (
              <div 
                key={idx} 
                className={`token-item ${selectedChartToken === token.mint ? 'active' : ''}`}
                onClick={() => setSelectedChartToken(token.mint)}
              >
                <div className="token-info">
                  {token.logo ? (
                    <img src={token.logo} alt={token.symbol} className="token-logo-small" />
                  ) : (
                    <div className="token-logo-placeholder">{token.symbol.substring(0, 2)}</div>
                  )}
                  <div className="token-details">
                    <div className="token-symbol">{token.symbol}</div>
                    <div className="token-mint">{token.mint.slice(0, 6)}...</div>
                  </div>
                </div>
                <div className="token-stats">
                  <div className="token-price">${token.price?.toFixed(4) || '0.00'}</div>
                  <div className={`token-change ${token.change24h >= 0 ? 'positive' : 'negative'}`}>
                    {token.change24h >= 0 ? '+' : ''}{token.change24h?.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CENTER COLUMN - TOKEN CHART WITH BIRDEYE - 50% */}
      <div className="center-column">
        <div className="column-header">TOKEN CHART</div>
        
        <div className="chart-container">
          <iframe
            src={getBirdeyeEmbedUrl(selectedChartToken)}
            width="100%"
            height="500"
            frameBorder="0"
            allowFullScreen
            className="birdeye-chart"
            title="Birdeye Chart"
          />
        </div>

        <div className="chart-stats">
          {tokenPrices[selectedChartToken] ? (
            <>
              <div className="chart-stat-item">
                <span className="chart-stat-label">24H VOLUME</span>
                <span className="chart-stat-value">
                  ${tokenPrices[selectedChartToken]?.volume24h?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="chart-stat-item">
                <span className="chart-stat-label">LIQUIDITY</span>
                <span className="chart-stat-value">
                  ${tokenPrices[selectedChartToken]?.liquidity?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="chart-stat-item">
                <span className="chart-stat-label">VIEW ON BIRDEYE</span>
                <span className="chart-stat-value">
                  <a 
                    href={getBirdeyeChartUrl(selectedChartToken)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#6c9bd2', textDecoration: 'none' }}
                  >
                    CLICK HERE
                  </a>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="chart-stat-item">
                <span className="chart-stat-label">24H VOLUME</span>
                <span className="chart-stat-value">LOADING...</span>
              </div>
              <div className="chart-stat-item">
                <span className="chart-stat-label">LIQUIDITY</span>
                <span className="chart-stat-value">LOADING...</span>
              </div>
              <div className="chart-stat-item">
                <span className="chart-stat-label">VIEW ON BIRDEYE</span>
                <span className="chart-stat-value">
                  <a 
                    href={getBirdeyeChartUrl(selectedChartToken)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#6c9bd2', textDecoration: 'none' }}
                  >
                    CLICK HERE
                  </a>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN - SWAP - 30% */}
      <div className="right-column">
        <div className="column-header">SWAP TOKENS</div>
        
        <div className="swap-container">
          <div className="swap-section">
            <label className="swap-label">FROM TOKEN</label>
            <select 
              className="swap-select"
              value={fromToken?.mint || ''} 
              onChange={(e) => {
                const token = tokensWithPrices.find(t => t.mint === e.target.value);
                setFromToken(token);
              }}
            >
              <option value="">SELECT TOKEN</option>
              {tokensWithPrices.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} - ${t.price?.toFixed(4) || '0.00'}
                </option>
              ))}
            </select>
          </div>

          <div className="swap-arrow"></div>

          <div className="swap-section">
            <label className="swap-label">TO TOKEN</label>
            <select 
              className="swap-select"
              value={toToken?.mint || ''} 
              onChange={(e) => {
                const token = tokensWithPrices.find(t => t.mint === e.target.value);
                setToToken(token);
              }}
            >
              <option value="">SELECT TOKEN</option>
              {tokensWithPrices.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} - ${t.price?.toFixed(4) || '0.00'}
                </option>
              ))}
            </select>
          </div>

          <div className="swap-section">
            <label className="swap-label">AMOUNT</label>
            <input
              type="number"
              className="swap-input"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
              placeholder="0.0"
              step="any"
            />
          </div>

          <div className="swap-buttons">
            <button className="estimate-btn" onClick={handleEstimateSwap}>
              ESTIMATE OUTPUT
            </button>
            <button 
              className="swap-btn" 
              onClick={handleExecuteSwap}
              disabled={!selectedPool || !swapAmount}
            >
              EXECUTE SWAP
            </button>
          </div>

          {selectedPool && (
            <div className="pool-info">
              <div className="pool-info-row">
                <span className="pool-info-label">POOL:</span>
                <span className="pool-info-value">{selectedPool.symbolA}/{selectedPool.symbolB}</span>
              </div>
              <div className="pool-info-row">
                <span className="pool-info-label">LIQUIDITY:</span>
                <span className="pool-info-value">
                  {(selectedPool.reserveA / 1e6).toFixed(2)} {selectedPool.symbolA} / {(selectedPool.reserveB / 1e6).toFixed(2)} {selectedPool.symbolB}
                </span>
              </div>
              <div className="pool-info-row">
                <span className="pool-info-label">FEE:</span>
                <span className="pool-info-value">{selectedPool.fee / 100}%</span>
              </div>
            </div>
          )}

          {estimatedOutput && (
            <div className="estimated-output">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{estimatedOutput}</pre>
            </div>
          )}

          {swapStatus && (
            <div className="swap-status">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{swapStatus}</pre>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .swap-router-three-columns {
          display: flex;
          width: 100%;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          margin: 0;
          padding: 0;
        }

        .left-column {
          flex: 0 0 20%;
          display: flex;
          flex-direction: column;
          background: rgba(12, 17, 26, 0.9);
          padding: 20px;
          overflow-y: auto;
          min-height: 100vh;
          border-right: 1px solid #232a36;
        }

        .center-column {
          flex: 0 0 50%;
          display: flex;
          flex-direction: column;
          background: rgba(12, 17, 26, 0.9);
          padding: 20px;
          overflow-y: auto;
          min-height: 100vh;
          border-right: 1px solid #232a36;
        }

        .right-column {
          flex: 0 0 30%;
          display: flex;
          flex-direction: column;
          background: rgba(12, 17, 26, 0.9);
          padding: 20px;
          overflow-y: auto;
          min-height: 100vh;
        }

        .column-header {
          font-size: 18px;
          font-weight: 700;
          color: #6c9bd2;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #6c9bd2;
          letter-spacing: 1px;
          text-align: center;
        }

        .search-container {
          margin-bottom: 20px;
        }

        .search-input {
          width: 100%;
          padding: 10px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          color: #e6edf5;
          font-size: 12px;
        }

        .search-input:focus {
          outline: none;
          border-color: #6c9bd2;
        }

        .tokens-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          overflow-y: auto;
        }

        .token-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .token-item:hover {
          border-color: #6c9bd2;
          background: #0f1419;
        }

        .token-item.active {
          border-color: #6c9bd2;
          background: rgba(108, 155, 210, 0.1);
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .token-logo-small {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
        }

        .token-logo-placeholder {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: white;
        }

        .token-details {
          display: flex;
          flex-direction: column;
        }

        .token-symbol {
          font-size: 12px;
          font-weight: 700;
          color: #6c9bd2;
        }

        .token-mint {
          font-size: 9px;
          color: #5a6e8a;
        }

        .token-stats {
          text-align: right;
        }

        .token-price {
          font-size: 11px;
          font-weight: 600;
          color: #e6edf5;
        }

        .token-change {
          font-size: 10px;
          font-weight: 600;
        }

        .token-change.positive {
          color: #6fcf97;
        }

        .token-change.negative {
          color: #dc2626;
        }

        .chart-container {
          width: 100%;
          height: 500px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .birdeye-chart {
          width: 100%;
          height: 100%;
          border: none;
        }

        .chart-stats {
          display: flex;
          gap: 16px;
          padding: 16px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 12px;
        }

        .chart-stat-item {
          flex: 1;
          text-align: center;
        }

        .chart-stat-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          color: #5a6e8a;
          margin-bottom: 4px;
          letter-spacing: 1px;
        }

        .chart-stat-value {
          font-size: 12px;
          font-weight: 700;
          color: #6c9bd2;
        }

        .swap-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .swap-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .swap-label {
          font-size: 11px;
          font-weight: 700;
          color: #8e9bae;
          letter-spacing: 1px;
        }

        .swap-select, .swap-input {
          width: 100%;
          padding: 10px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          color: #e6edf5;
          font-size: 12px;
        }

        .swap-select:focus, .swap-input:focus {
          outline: none;
          border-color: #6c9bd2;
        }

        .swap-arrow {
          text-align: center;
          font-size: 18px;
          color: #6c9bd2;
        }

        .swap-arrow::after {
          content: '↓';
        }

        .swap-buttons {
          display: flex;
          gap: 10px;
          margin-top: 8px;
        }

        .estimate-btn {
          flex: 1;
          padding: 10px;
          background: rgba(108, 155, 210, 0.1);
          border: 1px solid #6c9bd2;
          border-radius: 8px;
          color: #6c9bd2;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 1px;
        }

        .estimate-btn:hover {
          background: rgba(108, 155, 210, 0.2);
        }

        .swap-btn {
          flex: 1;
          padding: 10px;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 1px;
        }

        .swap-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(108, 155, 210, 0.3);
        }

        .swap-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pool-info, .estimated-output, .swap-status {
          padding: 10px;
          background: #0c111a;
          border: 1px solid #1e2a3a;
          border-radius: 8px;
          font-size: 10px;
          color: #e6edf5;
          line-height: 1.4;
        }

        .pool-info-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }

        .pool-info-label {
          color: #8e9bae;
        }

        .pool-info-value {
          color: #e6edf5;
          font-weight: 500;
        }

        .empty-message {
          text-align: center;
          padding: 40px;
          color: #5a6e8a;
          font-size: 12px;
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-track {
          background: #0c111a;
        }

        ::-webkit-scrollbar-thumb {
          background: #232a36;
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #6c9bd2;
        }

        @media (max-width: 1024px) {
          .swap-router-three-columns {
            flex-direction: column;
          }
          
          .left-column, .center-column, .right-column {
            flex: none;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #232a36;
          }
        }

        @media (max-width: 768px) {
          .left-column, .center-column, .right-column {
            padding: 15px;
          }
          
          .column-header {
            font-size: 16px;
          }
          
          .swap-buttons {
            flex-direction: column;
          }
          
          .chart-stats {
            flex-direction: column;
            gap: 10px;
          }
          
          .chart-container {
            height: 400px;
          }
        }
      `}</style>
    </div>
  );
};

export default SwapRouterPage;

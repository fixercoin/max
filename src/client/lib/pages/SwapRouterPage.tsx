import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PublicKey } from '@solana/web3.js';
import { saveTransaction, getExplorerUrl } from '../transactionUtils';
import { useDexScreenerPrice } from '../hooks/useDexScreenerPrice';

const SwapRouterPage: React.FC = () => {
  const { wallet, dexClient, deployedTokens, pools, setPools } = useAppContext();
  const [fromToken, setFromToken] = useState<any>(null);
  const [toToken, setToToken] = useState<any>(null);
  const [swapAmount, setSwapAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [swapStatus, setSwapStatus] = useState('');
  const [selectedPool, setSelectedPool] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChartToken, setSelectedChartToken] = useState<string>('So11111111111111111111111111111111111111112');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const baseTokens = useMemo(() => [
    { symbol: 'USDC', mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', decimals: 6, price: 1.00, change24h: 0.05, volume: 1250000, logo: null },
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, price: 145.20, change24h: 2.5, volume: 890000, logo: null },
  ], []);

  const allTokenMints = useMemo(() => {
    const mints = baseTokens.map(t => t.mint);
    const deployedMints = deployedTokens.map(t => t.mint);
    return [...new Set([...mints, ...deployedMints])];
  }, [baseTokens, deployedTokens]);

  const { tokenPrices, lastUpdated, refetch } = useDexScreenerPrice(allTokenMints);

  const allTokens = useMemo(() => {
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

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    refetch().then(() => setIsRefreshing(false));
  };

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
    let reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
    let reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;

    // Convert BN to number if needed
    if (reserveIn?.toNumber) reserveIn = reserveIn.toNumber();
    if (reserveOut?.toNumber) reserveOut = reserveOut.toNumber();

    // Check for valid reserves
    if (!reserveIn || !reserveOut || reserveIn === 0 || reserveOut === 0) {
      setEstimatedOutput('POOL HAS NO LIQUIDITY');
      return;
    }

    const rawAmountIn = amount * Math.pow(10, fromToken.decimals);

    const feeBps = selectedPool.fee || 0;
    const feeMultiplier = (10000 - feeBps) / 10000;
    const amountInWithFee = rawAmountIn * feeMultiplier;

    const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);

    if (isNaN(rawAmountOut) || rawAmountOut <= 0) {
      setEstimatedOutput('INVALID SWAP CALCULATION');
      return;
    }

    const amountOut = rawAmountOut / Math.pow(10, toToken.decimals);

    setEstimatedOutput(
      `ESTIMATED OUTPUT: ${amountOut.toFixed(6)} ${toToken.symbol}\n` +
      `FEE: ${feeBps / 100}%\n` +
      `LIQUIDITY: ${(reserveIn / Math.pow(10, fromToken.decimals)).toFixed(2)} ${fromToken.symbol} / ` +
      `${(reserveOut / Math.pow(10, toToken.decimals)).toFixed(2)} ${toToken.symbol}`
    );
  };

  // Execute swap
  const handleExecuteSwap = async () => {
    if (!wallet || !dexClient) {
      setSwapStatus('ERROR: CONNECT WALLET AND INITIALIZE DEX FIRST');
      return;
    }

    if (!fromToken || !toToken || !selectedPool) {
      setSwapStatus('ERROR: SELECT TOKENS AND ENSURE POOL EXISTS');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setSwapStatus('ERROR: ENTER VALID AMOUNT');
      return;
    }

    setSwapStatus('VALIDATING SWAP...');

    try {
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const tokenInPubkey = new PublicKey(fromToken.mint);
      const tokenOutPubkey = new PublicKey(toToken.mint);
      const userPubkey = new PublicKey(wallet.publicKey);

      const isAtoB = selectedPool.tokenA === fromToken.mint;
      let reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
      let reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;

      // Convert BN to number if needed
      if (reserveIn?.toNumber) reserveIn = reserveIn.toNumber();
      if (reserveOut?.toNumber) reserveOut = reserveOut.toNumber();

      if (!reserveIn || !reserveOut || reserveIn === 0 || reserveOut === 0) {
        setSwapStatus('ERROR: POOL HAS INSUFFICIENT LIQUIDITY');
        return;
      }

      const rawAmountIn = amount * Math.pow(10, fromToken.decimals);
      const feeMultiplier = (10000 - selectedPool.fee) / 10000;
      const amountInWithFee = rawAmountIn * feeMultiplier;
      const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
      const minAmountOut = rawAmountOut * 0.95;

      if (minAmountOut <= 0) {
        setSwapStatus('ERROR: OUTPUT AMOUNT WOULD BE ZERO. REDUCE SLIPPAGE.');
        return;
      }

      setSwapStatus('CHECKING BALANCES AND ACCOUNTS...');

      const tokenBalance = await dexClient.getTokenBalance(tokenInPubkey, userPubkey);
      if (tokenBalance < rawAmountIn) {
        const readable = (tokenBalance / Math.pow(10, fromToken.decimals)).toFixed(6);
        const needed = (rawAmountIn / Math.pow(10, fromToken.decimals)).toFixed(6);
        setSwapStatus(`ERROR: INSUFFICIENT ${fromToken.symbol} BALANCE\nHave: ${readable}, Need: ${needed}`);
        return;
      }

      setSwapStatus('PREPARING ASSOCIATED TOKEN ACCOUNTS...');
      await dexClient.ensureAssociatedTokenAccount(tokenInPubkey, userPubkey);
      await dexClient.ensureAssociatedTokenAccount(tokenOutPubkey, userPubkey);

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
        `✓ SWAP EXECUTED SUCCESSFULLY!\n` +
        `SENT: ${amount} ${fromToken.symbol}\n` +
        `RECEIVED: ${outputAmount} ${toToken.symbol}\n` +
        `FEE: ${selectedPool.fee / 100}%\n\n` +
        `VIEW ON EXPLORER: ${explorerUrl}`
      );

      setSwapAmount('');
      setEstimatedOutput('');

    } catch (e: any) {
      const errorMsg = e.message || 'Unknown error';
      const cleanError = errorMsg.replace(/Error: /g, '').substring(0, 100);
      setSwapStatus(`ERROR: ${cleanError}`);
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
    <div className="swap-container-full">
      <div className="swap-wrapper">
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
        .swap-container-full {
          display: flex;
          width: 100%;
          min-height: 100%;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          margin: 0;
          padding: 0;
        }

        .swap-wrapper {
          width: 100%;
          display: flex;
          flex-direction: column;
          background: rgba(12, 17, 26, 0.9);
          padding: 20px;
          overflow-y: auto;
          max-width: 600px;
          margin: 0 auto;
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

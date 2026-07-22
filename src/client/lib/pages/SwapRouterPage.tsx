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
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

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
        price: 0,
        change24h: 0,
        volume: 0,
        logo: t.logo || null
      }))
    ];
  }, [baseTokens, deployedTokens]);

  const tokensWithPrices = useMemo(() => {
    return allTokens.map(token => ({
      ...token,
      price: tokenPrices[token.mint]?.price || token.price || 0,
      change24h: tokenPrices[token.mint]?.change24h || token.change24h || 0,
      volume24h: tokenPrices[token.mint]?.volume24h || token.volume || 0,
      liquidity: tokenPrices[token.mint]?.liquidity || 0,
    }));
  }, [allTokens, tokenPrices]);

  const filteredTokens = useMemo(() => {
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
        dexClient.fetchPoolReserves(new PublicKey(pool.poolAddress))
          .then(poolData => {
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
          })
          .catch(e => {
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

  // Get swap quote from router
  const getSwapQuote = async (amountIn: number) => {
    if (!dexClient || !selectedPool || !fromToken || !toToken) return null;

    try {
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const tokenInPubkey = new PublicKey(fromToken.mint);
      const tokenOutPubkey = new PublicKey(toToken.mint);

      const isAtoB = selectedPool.tokenA === fromToken.mint;
      let reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
      let reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;

      if (reserveIn?.toNumber) reserveIn = reserveIn.toNumber();
      if (reserveOut?.toNumber) reserveOut = reserveOut.toNumber();

      if (!reserveIn || !reserveOut || reserveIn === 0 || reserveOut === 0) {
        return null;
      }

      const rawAmountIn = amountIn * Math.pow(10, fromToken.decimals);
      const feeBps = selectedPool.fee || 30;
      const feeMultiplier = (10000 - feeBps) / 10000;
      const amountInWithFee = rawAmountIn * feeMultiplier;
      const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);

      return {
        amountOut: rawAmountOut / Math.pow(10, toToken.decimals),
        rawAmountOut: rawAmountOut,
        fee: feeBps / 100,
        priceImpact: ((rawAmountIn / reserveIn) * 100) || 0,
        reserveIn,
        reserveOut,
        rawAmountIn
      };
    } catch (error) {
      console.error('Quote error:', error);
      return null;
    }
  };

  // Estimate swap output
  const handleEstimateSwap = async () => {
    if (!fromToken || !toToken || !selectedPool) {
      setEstimatedOutput('SELECT TOKENS AND ENSURE POOL EXISTS');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setEstimatedOutput('ENTER VALID AMOUNT');
      return;
    }

    setIsLoadingQuote(true);
    setEstimatedOutput('FETCHING QUOTE...');

    try {
      const quote = await getSwapQuote(amount);
      
      if (!quote) {
        setEstimatedOutput('POOL HAS NO LIQUIDITY');
        setIsLoadingQuote(false);
        return;
      }

      setEstimatedOutput(
        `📊 SWAP QUOTE\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `SEND: ${amount} ${fromToken.symbol}\n` +
        `RECEIVE: ${quote.amountOut.toFixed(6)} ${toToken.symbol}\n` +
        `FEE: ${quote.fee}%\n` +
        `PRICE IMPACT: ${quote.priceImpact.toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `LIQUIDITY: ${(quote.reserveIn / Math.pow(10, fromToken.decimals)).toFixed(2)} ${fromToken.symbol} / ` +
        `${(quote.reserveOut / Math.pow(10, toToken.decimals)).toFixed(2)} ${toToken.symbol}`
      );
    } catch (error) {
      setEstimatedOutput('ERROR FETCHING QUOTE');
      console.error('Quote error:', error);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // Execute swap
  const handleExecuteSwap = async () => {
    if (!wallet || !dexClient) {
      setSwapStatus('⚠️ CONNECT WALLET AND INITIALIZE DEX FIRST');
      return;
    }

    if (!fromToken || !toToken || !selectedPool) {
      setSwapStatus('⚠️ SELECT TOKENS AND ENSURE POOL EXISTS');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setSwapStatus('⚠️ ENTER VALID AMOUNT');
      return;
    }

    setIsSwapping(true);
    setSwapStatus('🔄 VALIDATING SWAP...');

    try {
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const tokenInPubkey = new PublicKey(fromToken.mint);
      const tokenOutPubkey = new PublicKey(toToken.mint);
      const userPubkey = new PublicKey(wallet.publicKey);

      const isAtoB = selectedPool.tokenA === fromToken.mint;
      let reserveIn = isAtoB ? selectedPool.reserveA : selectedPool.reserveB;
      let reserveOut = isAtoB ? selectedPool.reserveB : selectedPool.reserveA;

      if (reserveIn?.toNumber) reserveIn = reserveIn.toNumber();
      if (reserveOut?.toNumber) reserveOut = reserveOut.toNumber();

      if (!reserveIn || !reserveOut || reserveIn === 0 || reserveOut === 0) {
        setSwapStatus('❌ POOL HAS INSUFFICIENT LIQUIDITY');
        setIsSwapping(false);
        return;
      }

      const rawAmountIn = amount * Math.pow(10, fromToken.decimals);
      const feeMultiplier = (10000 - (selectedPool.fee || 30)) / 10000;
      const amountInWithFee = rawAmountIn * feeMultiplier;
      const rawAmountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
      const minAmountOut = rawAmountOut * 0.95;

      if (minAmountOut <= 0) {
        setSwapStatus('❌ OUTPUT AMOUNT WOULD BE ZERO. REDUCE SLIPPAGE.');
        setIsSwapping(false);
        return;
      }

      setSwapStatus('🔍 CHECKING BALANCES...');

      const tokenBalance = await dexClient.getTokenBalance(tokenInPubkey, userPubkey);
      if (tokenBalance < rawAmountIn) {
        const readable = (tokenBalance / Math.pow(10, fromToken.decimals)).toFixed(6);
        const needed = (rawAmountIn / Math.pow(10, fromToken.decimals)).toFixed(6);
        setSwapStatus(`❌ INSUFFICIENT ${fromToken.symbol} BALANCE\nHAVE: ${readable} | NEED: ${needed}`);
        setIsSwapping(false);
        return;
      }

      setSwapStatus('📝 PREPARING TOKEN ACCOUNTS...');
      await dexClient.ensureAssociatedTokenAccount(tokenInPubkey, userPubkey);
      await dexClient.ensureAssociatedTokenAccount(tokenOutPubkey, userPubkey);

      setSwapStatus('✍️ REQUESTING SIGNATURE...');

      const txHash = await dexClient.swap(
        poolPubkey,
        tokenInPubkey,
        tokenOutPubkey,
        rawAmountIn,
        minAmountOut
      );

      setSwapStatus('⏳ CONFIRMING TRANSACTION...');

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

      const outputAmount = (rawAmountOut / Math.pow(10, toToken.decimals)).toFixed(6);
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
        `✅ SWAP EXECUTED SUCCESSFULLY!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `SENT: ${amount} ${fromToken.symbol}\n` +
        `RECEIVED: ${outputAmount} ${toToken.symbol}\n` +
        `FEE: ${(selectedPool.fee || 30) / 100}%\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 VIEW: ${explorerUrl}`
      );

      setSwapAmount('');
      setEstimatedOutput('');

    } catch (e: any) {
      const errorMsg = e.message || 'UNKNOWN ERROR';
      const cleanError = errorMsg.replace(/Error: /g, '').substring(0, 100);
      setSwapStatus(`❌ ERROR: ${cleanError}`);
      console.error('Swap error:', e);
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="swap-container-full">
      <div className="swap-wrapper">
        <div className="column-header">💱 SWAP TOKENS</div>
        
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

          <div className="swap-arrow">↓</div>

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
            <button 
              className="estimate-btn" 
              onClick={handleEstimateSwap}
              disabled={isLoadingQuote || !selectedPool}
            >
              {isLoadingQuote ? 'LOADING...' : 'ESTIMATE OUTPUT'}
            </button>
            <button 
              className="swap-btn" 
              onClick={handleExecuteSwap}
              disabled={isSwapping || !selectedPool || !swapAmount || !wallet}
            >
              {isSwapping ? 'SWAPPING...' : 'EXECUTE SWAP'}
            </button>
          </div>

          {selectedPool && (
            <div className="pool-info">
              <div className="pool-info-row">
                <span className="pool-info-label">📊 POOL</span>
                <span className="pool-info-value">{selectedPool.symbolA}/{selectedPool.symbolB}</span>
              </div>
              <div className="pool-info-row">
                <span className="pool-info-label">💧 LIQUIDITY</span>
                <span className="pool-info-value">
                  {(selectedPool.reserveA / Math.pow(10, 6)).toFixed(2)} {selectedPool.symbolA} / {(selectedPool.reserveB / Math.pow(10, 6)).toFixed(2)} {selectedPool.symbolB}
                </span>
              </div>
              <div className="pool-info-row">
                <span className="pool-info-label">💰 FEE</span>
                <span className="pool-info-value">{selectedPool.fee / 100}%</span>
              </div>
            </div>
          )}

          {estimatedOutput && (
            <div className="estimated-output">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, color: '#e6edf5' }}>
                {estimatedOutput}
              </pre>
            </div>
          )}

          {swapStatus && (
            <div className="swap-status">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, color: '#e6edf5' }}>
                {swapStatus}
              </pre>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .swap-container-full {
          display: flex;
          width: 100%;
          min-height: 100%;
          background: #0A0A0F;
          margin: 0;
          padding: 0;
        }

        .swap-wrapper {
          width: 100%;
          display: flex;
          flex-direction: column;
          background: #0A0A0F;
          padding: 20px;
          overflow-y: auto;
          max-width: 480px;
          margin: 0 auto;
        }

        .column-header {
          font-size: 18px;
          font-weight: 700;
          color: #00D4FF;
          margin-bottom: 24px;
          padding-bottom: 12px;
          border-bottom: 2px solid rgba(0, 212, 255, 0.2);
          letter-spacing: 1px;
          text-align: center;
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
          text-transform: uppercase;
        }

        .swap-select, .swap-input {
          width: 100%;
          padding: 12px 14px;
          background: #1a1a2e;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          color: #e6edf5;
          font-size: 13px;
          transition: all 0.3s ease;
        }

        .swap-select:focus, .swap-input:focus {
          outline: none;
          border-color: #00D4FF;
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.1);
        }

        .swap-select option {
          background: #1a1a2e;
          color: #e6edf5;
        }

        .swap-arrow {
          text-align: center;
          font-size: 20px;
          color: #00D4FF;
          padding: 4px 0;
        }

        .swap-buttons {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }

        .estimate-btn {
          flex: 1;
          padding: 12px;
          background: rgba(0, 212, 255, 0.08);
          border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 10px;
          color: #00D4FF;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 1px;
          transition: all 0.3s ease;
          text-transform: uppercase;
        }

        .estimate-btn:hover:not(:disabled) {
          background: rgba(0, 212, 255, 0.15);
          border-color: #00D4FF;
        }

        .estimate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .swap-btn {
          flex: 1;
          padding: 12px;
          background: linear-gradient(135deg, #00D4FF 0%, #0099cc 100%);
          border: none;
          border-radius: 10px;
          color: #0A0A0F;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 1px;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }

        .swap-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 212, 255, 0.3);
        }

        .swap-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .pool-info {
          padding: 14px;
          background: #1a1a2e;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          font-size: 11px;
          color: #e6edf5;
          line-height: 1.6;
        }

        .pool-info-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }

        .pool-info-label {
          color: #8e9bae;
          font-weight: 500;
        }

        .pool-info-value {
          color: #e6edf5;
          font-weight: 500;
        }

        .estimated-output, .swap-status {
          padding: 14px;
          background: #1a1a2e;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          font-size: 11px;
          color: #e6edf5;
          line-height: 1.6;
          min-height: 60px;
        }

        .swap-status {
          border-color: rgba(0, 212, 255, 0.2);
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-track {
          background: #0A0A0F;
        }

        ::-webkit-scrollbar-thumb {
          background: #2a2a3e;
          border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #00D4FF;
        }

        @media (max-width: 768px) {
          .swap-wrapper {
            padding: 15px;
            max-width: 100%;
          }
          
          .column-header {
            font-size: 16px;
          }
          
          .swap-buttons {
            flex-direction: column;
          }
          
          .swap-select, .swap-input {
            padding: 10px 12px;
          }
        }

        @media (max-width: 480px) {
          .swap-wrapper {
            padding: 12px;
          }
          
          .swap-container {
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default SwapRouterPage;

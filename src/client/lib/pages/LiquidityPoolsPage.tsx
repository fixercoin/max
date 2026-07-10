import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PublicKey } from '@solana/web3.js';
import { saveTransaction, getExplorerUrl } from '../transactionUtils';

const LiquidityPoolsPage: React.FC = () => {
  const { wallet, dexClient, deployedTokens, pools, setPools } = useAppContext();
  const [tokenAMint, setTokenAMint] = useState('');
  const [tokenBMint, setTokenBMint] = useState('');
  const [feeBps, setFeeBps] = useState(25);
  const [poolStatus, setPoolStatus] = useState('');
  const [selectedPool, setSelectedPool] = useState<any>(null);
  const [addAmountA, setAddAmountA] = useState('');
  const [addAmountB, setAddAmountB] = useState('');
  const [liquidityStatus, setLiquidityStatus] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [swapStatus, setSwapStatus] = useState('');

  const loadPoolsFromChain = useCallback(async () => {
    if (!dexClient || pools.length === 0) return;

    try {
      // Filter to only mainnet pools
      const mainnetPools = pools.filter(p => p.network === 'mainnet-beta' || !p.network);
      if (mainnetPools.length === 0) return;

      const updatedPools = [];
      for (const pool of mainnetPools) {
        try {
          const poolPubkey = new PublicKey(pool.poolAddress);
          const poolData = await dexClient.fetchPoolReserves(poolPubkey);
          if (poolData) {
            updatedPools.push({
              ...pool,
              reserveA: poolData.reserveA?.toNumber?.() || poolData.reserveA || 0,
              reserveB: poolData.reserveB?.toNumber?.() || poolData.reserveB || 0,
              totalLp: poolData.lpSupply?.toNumber?.() || poolData.lpSupply || 0,
              totalVolume: poolData.totalVolume?.toNumber?.() || 0,
            });
          } else {
            updatedPools.push(pool);
          }
        } catch (e) {
          console.error(`Failed to fetch pool ${pool.poolAddress}:`, e);
          updatedPools.push(pool);
        }
      }
      if (updatedPools.length > 0) {
        setPools(updatedPools);
        localStorage.setItem('MAX_pools', JSON.stringify(updatedPools));
      }
    } catch (e) {
      console.error("Failed to load pools:", e);
    }
  }, [dexClient, pools, setPools]);

  useEffect(() => {
    loadPoolsFromChain();
  }, [loadPoolsFromChain]);

  const handleCreatePool = async () => {
    if (!wallet || !dexClient) {
      setPoolStatus('ERROR: CONNECT WALLET AND INITIALIZE DEX FIRST');
      return;
    }

    if (!tokenAMint || !tokenBMint) {
      setPoolStatus('ERROR: ENTER BOTH TOKEN MINT ADDRESSES');
      return;
    }

    if (tokenAMint === tokenBMint) {
      setPoolStatus('ERROR: CANNOT CREATE POOL WITH SAME TOKEN');
      return;
    }

    if (feeBps < 0 || feeBps > 10000) {
      setPoolStatus('ERROR: FEE MUST BE BETWEEN 0 AND 10000 BASIS POINTS');
      return;
    }

    setPoolStatus('VALIDATING TOKEN ADDRESSES...');

    try {
      const tokenAPubkey = new PublicKey(tokenAMint);
      const tokenBPubkey = new PublicKey(tokenBMint);

      setPoolStatus('CHECKING IF TOKENS EXIST ON CHAIN...');
      const tokenAExists = await dexClient.validateTokenExists(tokenAPubkey);
      if (!tokenAExists.exists) {
        setPoolStatus(`ERROR: TOKEN A NOT FOUND - ${tokenAExists.error}`);
        return;
      }

      const tokenBExists = await dexClient.validateTokenExists(tokenBPubkey);
      if (!tokenBExists.exists) {
        setPoolStatus(`ERROR: TOKEN B NOT FOUND - ${tokenBExists.error}`);
        return;
      }

      setPoolStatus('CHECKING IF POOL ALREADY EXISTS...');
      const poolAlreadyExists = await dexClient.poolExists(tokenAPubkey, tokenBPubkey);
      if (poolAlreadyExists) {
        setPoolStatus('ERROR: POOL FOR THIS TOKEN PAIR ALREADY EXISTS');
        return;
      }

      setPoolStatus('CREATING POOL ON MAX DEX...');
      const poolAddress = await dexClient.createPool(tokenAPubkey, tokenBPubkey, feeBps);

      const tokenAData = deployedTokens.find((t) => t.mint === tokenAMint);
      const tokenBData = deployedTokens.find((t) => t.mint === tokenBMint);
      const symbolA = tokenAData ? tokenAData.symbol : tokenAMint.slice(0, 6);
      const symbolB = tokenBData ? tokenBData.symbol : tokenBMint.slice(0, 6);

      const newPools = [
        ...pools,
        {
          tokenA: tokenAMint,
          tokenB: tokenBMint,
          symbolA,
          symbolB,
          fee: feeBps,
          poolAddress: poolAddress.toString(),
          reserveA: 0,
          reserveB: 0,
          totalLp: 0,
          network: 'mainnet-beta',
        },
      ];
      setPools(newPools);
      localStorage.setItem('MAX_pools', JSON.stringify(newPools));

      setPoolStatus(
        `✓ POOL CREATED SUCCESSFULLY!\n` +
        `PAIR: ${symbolA}/${symbolB}\n` +
        `FEE: ${feeBps / 100}%\n` +
        `ADDRESS: ${poolAddress.toString()}`
      );
      setTokenAMint('');
      setTokenBMint('');

      setTimeout(() => {
        loadPoolsFromChain();
      }, 2000);
    } catch (e: any) {
      const errorMsg = e.message || 'Unknown error';
      const cleanError = errorMsg.replace(/Error: /g, '').substring(0, 150);
      setPoolStatus(`ERROR: ${cleanError}`);
      console.error('Pool creation error:', e);
    }
  };

  const handleAddLiquidity = async () => {
    if (!wallet || !dexClient || !selectedPool) {
      setLiquidityStatus('ERROR: SELECT A POOL FIRST');
      return;
    }

    const amountA = parseFloat(addAmountA);
    const amountB = parseFloat(addAmountB);

    if (isNaN(amountA) || isNaN(amountB) || amountA <= 0 || amountB <= 0) {
      setLiquidityStatus('ERROR: ENTER VALID AMOUNTS FOR BOTH TOKENS');
      return;
    }

    setLiquidityStatus('VALIDATING BALANCES...');

    try {
      const tokenAPubkey = new PublicKey(selectedPool.tokenA);
      const tokenBPubkey = new PublicKey(selectedPool.tokenB);
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const userPubkey = new PublicKey(wallet.publicKey);

      const tokenAData = deployedTokens.find((t) => t.mint === selectedPool.tokenA);
      const tokenBData = deployedTokens.find((t) => t.mint === selectedPool.tokenB);

      const rawAmountA = amountA * Math.pow(10, tokenAData?.decimals || 6);
      const rawAmountB = amountB * Math.pow(10, tokenBData?.decimals || 6);

      setLiquidityStatus('CHECKING TOKEN BALANCES...');
      const balanceA = await dexClient.getTokenBalance(tokenAPubkey, userPubkey);
      if (balanceA < rawAmountA) {
        const readable = (balanceA / Math.pow(10, tokenAData?.decimals || 6)).toFixed(6);
        setLiquidityStatus(`ERROR: INSUFFICIENT ${selectedPool.symbolA} BALANCE\nHave: ${readable}, Need: ${amountA}`);
        return;
      }

      const balanceB = await dexClient.getTokenBalance(tokenBPubkey, userPubkey);
      if (balanceB < rawAmountB) {
        const readable = (balanceB / Math.pow(10, tokenBData?.decimals || 6)).toFixed(6);
        setLiquidityStatus(`ERROR: INSUFFICIENT ${selectedPool.symbolB} BALANCE\nHave: ${readable}, Need: ${amountB}`);
        return;
      }

      setLiquidityStatus('PREPARING ASSOCIATED TOKEN ACCOUNTS...');
      await dexClient.ensureAssociatedTokenAccount(tokenAPubkey, userPubkey);
      await dexClient.ensureAssociatedTokenAccount(tokenBPubkey, userPubkey);

      setLiquidityStatus('REQUESTING TRANSACTION SIGNATURE...');
      const txHash = await dexClient.addLiquidity(poolPubkey, rawAmountA, rawAmountB, tokenAPubkey, tokenBPubkey);

      const explorerUrl = getExplorerUrl(txHash, 'mainnet');

      saveTransaction({
        id: Date.now().toString(),
        hash: txHash,
        type: 'add-liquidity',
        fromToken: selectedPool.symbolA,
        toToken: selectedPool.symbolB,
        amount: `${amountA}/${amountB}`,
        status: 'confirmed',
        timestamp: Date.now(),
        explorerUrl
      });

      setLiquidityStatus(
        `✓ LIQUIDITY ADDED SUCCESSFULLY!\n` +
        `AMOUNT A: ${amountA} ${selectedPool.symbolA}\n` +
        `AMOUNT B: ${amountB} ${selectedPool.symbolB}\n\n` +
        `VIEW ON EXPLORER: ${explorerUrl}`
      );
      setAddAmountA('');
      setAddAmountB('');

      await loadPoolsFromChain();
    } catch (e: any) {
      const errorMsg = e.message || 'Unknown error';
      const cleanError = errorMsg.replace(/Error: /g, '').substring(0, 150);
      setLiquidityStatus(`ERROR: ${cleanError}`);
      console.error('Add liquidity error:', e);
    }
  };

  const handleSwap = async () => {
    if (!wallet || !dexClient || !selectedPool) {
      alert('SELECT A POOL FIRST');
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('ENTER VALID AMOUNT');
      return;
    }

    setSwapStatus('SWAPPING...');

    try {
      const tokenInPubkey = new PublicKey(selectedPool.tokenA);
      const tokenOutPubkey = new PublicKey(selectedPool.tokenB);
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      
      const tokenInData = deployedTokens.find((t) => t.mint === selectedPool.tokenA);
      const rawAmount = amount * Math.pow(10, tokenInData?.decimals || 6);
      
      await dexClient.swap(poolPubkey, tokenInPubkey, tokenOutPubkey, rawAmount, 0);
      
      setSwapStatus('SWAP COMPLETED SUCCESSFULLY!');
      setSwapAmount('');
      
      await loadPoolsFromChain();
    } catch (e: any) {
      setSwapStatus(`SWAP FAILED: ${e.message}`);
    }
  };

  const handleRemoveLiquidity = async (lpAmount: number) => {
    if (!wallet || !dexClient || !selectedPool) {
      setLiquidityStatus('ERROR: SELECT A POOL FIRST');
      return;
    }

    if (lpAmount <= 0) {
      setLiquidityStatus('ERROR: ENTER VALID LP AMOUNT');
      return;
    }

    setLiquidityStatus('VALIDATING LP TOKEN BALANCE...');

    try {
      const poolPubkey = new PublicKey(selectedPool.poolAddress);
      const userPubkey = new PublicKey(wallet.publicKey);

      const poolAccount = await dexClient.program.account.poolAccount.fetch(poolPubkey) as any;
      const lpMint = poolAccount.lpMint as any;

      const rawLpAmount = lpAmount * Math.pow(10, 9);

      setLiquidityStatus('CHECKING LP TOKEN BALANCE...');
      const lpBalance = await dexClient.getTokenBalance(lpMint, userPubkey);
      if (lpBalance < rawLpAmount) {
        const readable = (lpBalance / Math.pow(10, 9)).toFixed(6);
        setLiquidityStatus(`ERROR: INSUFFICIENT LP TOKEN BALANCE\nHave: ${readable}, Need: ${lpAmount}`);
        return;
      }

      setLiquidityStatus('REQUESTING TRANSACTION SIGNATURE...');
      const txHash = await dexClient.removeLiquidity(poolPubkey, rawLpAmount);

      const explorerUrl = getExplorerUrl(txHash, 'mainnet');

      saveTransaction({
        id: Date.now().toString(),
        hash: txHash,
        type: 'remove-liquidity',
        fromToken: selectedPool.symbolA,
        toToken: selectedPool.symbolB,
        amount: lpAmount.toString(),
        status: 'confirmed',
        timestamp: Date.now(),
        explorerUrl
      });

      setLiquidityStatus(
        `✓ LIQUIDITY REMOVED SUCCESSFULLY!\n` +
        `LP TOKENS BURNED: ${lpAmount}\n\n` +
        `VIEW ON EXPLORER: ${explorerUrl}`
      );
      await loadPoolsFromChain();
    } catch (e: any) {
      const errorMsg = e.message || 'Unknown error';
      const cleanError = errorMsg.replace(/Error: /g, '').substring(0, 150);
      setLiquidityStatus(`ERROR: ${cleanError}`);
      console.error('Remove liquidity error:', e);
    }
  };

  return (
    <div className="liquidity-pools-two-columns">
      {/* LEFT COLUMN - LIQUIDITY POOLS */}
      <div className="left-column">
        <div className="column-header">LIQUIDITY POOLS</div>
        
        <div className="section-title">CREATE LIQUIDITY POOL</div>
        
        <div className="form-group">
          <label>TOKEN A MINT ADDRESS</label>
          <input
            type="text"
            value={tokenAMint}
            onChange={(e) => setTokenAMint(e.target.value)}
            placeholder="YOUR TOKEN MINT ADDRESS"
          />
        </div>

        <div className="form-group">
          <label>TOKEN B MINT ADDRESS</label>
          <input
            type="text"
            value={tokenBMint}
            onChange={(e) => setTokenBMint(e.target.value)}
            placeholder="USDC OR SOL MINT ADDRESS"
          />
        </div>

        <div className="form-group">
          <label>FEE BPS (100 = 1%)</label>
          <input 
            type="number" 
            value={feeBps} 
            onChange={(e) => setFeeBps(parseInt(e.target.value))}
            min="0"
            max="500"
          />
          <small>RECOMMENDED: 25 (0.25%)</small>
        </div>

        <button className="create-btn" onClick={handleCreatePool}>
          CREATE POOL
        </button>

        {poolStatus && (
          <div className="status-area">
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{poolStatus}</pre>
          </div>
        )}

        <div className="section-title" style={{ marginTop: '24px' }}>ALL POOLS</div>
        
        <div className="all-pools-list">
          {pools.filter(p => p.network === 'mainnet-beta' || !p.network).length === 0 ? (
            <div className="empty-message">NO LIQUIDITY POOLS YET</div>
          ) : (
            pools.filter(p => p.network === 'mainnet-beta' || !p.network).map((p, idx) => (
              <div
                key={idx}
                className={`pool-item ${selectedPool?.poolAddress === p.poolAddress ? 'active' : ''}`}
                onClick={() => setSelectedPool(p)}
              >
                <div className="pool-pair">{p.symbolA}/{p.symbolB}</div>
                <div className="pool-fee">FEE: {p.fee / 100}%</div>
                <div className="pool-reserves">
                  {p.reserveA / 1e6} {p.symbolA} / {p.reserveB / 1e6} {p.symbolB}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT COLUMN - SELECT POOL */}
      <div className="right-column">
        <div className="column-header">SELECT POOL</div>
        
        {!selectedPool ? (
          <div className="empty-selection">
            <div className="empty-icon"></div>
            <div className="empty-text">SELECT A POOL FROM THE LEFT COLUMN</div>
          </div>
        ) : (
          <>
            <div className="selected-pool-header">
              <div className="selected-pool-pair">{selectedPool.symbolA}/{selectedPool.symbolB}</div>
              <div className="selected-pool-fee">FEE: {selectedPool.fee / 100}%</div>
            </div>

            <div className="info-section">
              <div className="info-section-header">POOL STATISTICS</div>
              <div className="stat-row">
                <span className="stat-label">RESERVE A:</span>
                <span className="stat-value">{selectedPool.reserveA / 1e6} {selectedPool.symbolA}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">RESERVE B:</span>
                <span className="stat-value">{selectedPool.reserveB / 1e6} {selectedPool.symbolB}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">TOTAL LP SUPPLY:</span>
                <span className="stat-value">{selectedPool.totalLp / 1e9}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">TOTAL VOLUME:</span>
                <span className="stat-value">{selectedPool.totalVolume / 1e6 || 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">YOUR LP TOKENS:</span>
                <span className="stat-value">{selectedPool.userLpBalance / 1e9 || 0}</span>
              </div>
            </div>

            <div className="info-section">
              <div className="info-section-header">ADD LIQUIDITY</div>
              <div className="form-row">
                <div className="form-group half">
                  <label>{selectedPool.symbolA} AMOUNT</label>
                  <input
                    type="number"
                    value={addAmountA}
                    onChange={(e) => setAddAmountA(e.target.value)}
                    placeholder={`AMOUNT OF ${selectedPool.symbolA}`}
                  />
                </div>
                <div className="form-group half">
                  <label>{selectedPool.symbolB} AMOUNT</label>
                  <input
                    type="number"
                    value={addAmountB}
                    onChange={(e) => setAddAmountB(e.target.value)}
                    placeholder={`AMOUNT OF ${selectedPool.symbolB}`}
                  />
                </div>
              </div>
              <button className="action-btn add-btn" onClick={handleAddLiquidity}>
                ADD LIQUIDITY
              </button>
            </div>

            <div className="info-section">
              <div className="info-section-header">SWAP TOKENS</div>
              <div className="form-group">
                <label>SWAP {selectedPool.symbolA} TO {selectedPool.symbolB}</label>
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder={`AMOUNT OF ${selectedPool.symbolA}`}
                />
              </div>
              <button className="action-btn swap-btn" onClick={handleSwap}>
                SWAP TOKENS
              </button>
            </div>

            <div className="info-section">
              <div className="info-section-header">REMOVE LIQUIDITY</div>
              <button 
                className="action-btn remove-btn" 
                onClick={() => handleRemoveLiquidity((selectedPool.userLpBalance || 0) / 1e9)}
              >
                REMOVE ALL LIQUIDITY
              </button>
            </div>

            {liquidityStatus && (
              <div className="status-area">
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{liquidityStatus}</pre>
              </div>
            )}

            {swapStatus && (
              <div className="status-area">
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{swapStatus}</pre>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .liquidity-pools-two-columns {
          display: flex;
          width: 100%;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          margin: 0;
          padding: 0;
        }

        .left-column,
        .right-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(12, 17, 26, 0.9);
          padding: 24px;
          overflow-y: auto;
          min-height: 100vh;
        }

        .left-column {
          border-right: 1px solid #232a36;
        }

        .column-header {
          font-size: 20px;
          font-weight: 700;
          color: #6c9bd2;
          margin-bottom: 24px;
          padding-bottom: 12px;
          border-bottom: 2px solid #6c9bd2;
          letter-spacing: 1px;
          text-align: center;
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: #8e9bae;
          margin-bottom: 16px;
          letter-spacing: 1px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #8e9bae;
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          color: #e6edf5;
          font-size: 13px;
          transition: all 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #6c9bd2;
          box-shadow: 0 0 0 2px rgba(108, 155, 210, 0.1);
        }

        .form-group small {
          display: block;
          margin-top: 6px;
          font-size: 10px;
          color: #5a6e8a;
        }

        .form-row {
          display: flex;
          gap: 12px;
        }

        .form-group.half {
          flex: 1;
        }

        .create-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 1px;
          margin-top: 8px;
        }

        .create-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(108, 155, 210, 0.3);
        }

        .action-btn {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 1px;
          margin-top: 8px;
        }

        .add-btn {
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          color: white;
        }

        .swap-btn {
          background: rgba(108, 155, 210, 0.2);
          border: 1px solid #6c9bd2;
          color: #6c9bd2;
        }

        .remove-btn {
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid #dc2626;
          color: #dc2626;
        }

        .action-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .status-area {
          margin-top: 16px;
          padding: 12px;
          background: #0c111a;
          border-radius: 8px;
          border: 1px solid #1e2a3a;
          font-size: 11px;
          color: #e6edf5;
          line-height: 1.5;
          word-break: break-all;
        }

        .all-pools-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
        }

        .pool-item {
          padding: 12px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pool-item:hover {
          border-color: #6c9bd2;
          background: #0f1419;
          transform: translateX(4px);
        }

        .pool-item.active {
          border-color: #6c9bd2;
          background: rgba(108, 155, 210, 0.1);
        }

        .pool-pair {
          font-size: 14px;
          font-weight: 700;
          color: #6c9bd2;
          margin-bottom: 6px;
        }

        .pool-fee {
          font-size: 11px;
          color: #8e9bae;
          margin-bottom: 6px;
        }

        .pool-reserves {
          font-size: 10px;
          color: #5a6e8a;
        }

        .empty-message {
          text-align: center;
          padding: 40px;
          color: #5a6e8a;
          font-size: 13px;
          letter-spacing: 1px;
        }

        .empty-selection {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          background: #0a0e15;
          border: 2px dashed #232a36;
          border-radius: 12px;
          margin-top: 40px;
        }

        .empty-text {
          font-size: 14px;
          color: #5a6e8a;
          letter-spacing: 1px;
          text-align: center;
        }

        .selected-pool-header {
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border: 1px solid #6c9bd2;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          margin-bottom: 20px;
        }

        .selected-pool-pair {
          font-size: 18px;
          font-weight: 700;
          color: #6c9bd2;
          margin-bottom: 8px;
        }

        .selected-pool-fee {
          font-size: 12px;
          color: #8e9bae;
        }

        .info-section {
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .info-section-header {
          padding: 12px 16px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
          font-size: 12px;
          font-weight: 700;
          color: #6c9bd2;
          letter-spacing: 1px;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid #1e2a3a;
          font-size: 12px;
        }

        .stat-row:last-child {
          border-bottom: none;
        }

        .stat-label {
          color: #8e9bae;
          font-weight: 600;
        }

        .stat-value {
          color: #e6edf5;
          font-weight: 500;
        }

        .left-column::-webkit-scrollbar,
        .right-column::-webkit-scrollbar,
        .all-pools-list::-webkit-scrollbar {
          width: 6px;
        }

        .left-column::-webkit-scrollbar-track,
        .right-column::-webkit-scrollbar-track,
        .all-pools-list::-webkit-scrollbar-track {
          background: #0c111a;
          border-radius: 3px;
        }

        .left-column::-webkit-scrollbar-thumb,
        .right-column::-webkit-scrollbar-thumb,
        .all-pools-list::-webkit-scrollbar-thumb {
          background: #232a36;
          border-radius: 3px;
        }

        .left-column::-webkit-scrollbar-thumb:hover,
        .right-column::-webkit-scrollbar-thumb:hover,
        .all-pools-list::-webkit-scrollbar-thumb:hover {
          background: #6c9bd2;
        }

        @media (max-width: 1024px) {
          .liquidity-pools-two-columns {
            flex-direction: column;
          }

          .left-column {
            border-right: none;
            border-bottom: 1px solid #232a36;
          }

          .left-column,
          .right-column {
            min-height: auto;
          }
        }

        @media (max-width: 768px) {
          .left-column,
          .right-column {
            padding: 16px;
          }

          .form-row {
            flex-direction: column;
          }

          .column-header {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
};

export default LiquidityPoolsPage;

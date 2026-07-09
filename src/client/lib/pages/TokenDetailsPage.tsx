import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { getTokenMetadata, getTokenHolders } from '../solanaService';
import { PublicKey } from '@solana/web3.js';


const TokenDetailsPage: React.FC = () => {
  const { deployedTokens, selectedTokenForDetails, dexClient, pools } = useAppContext();
  const [holders, setHolders] = useState<any[]>([]);
  const [programMetadata, setProgramMetadata] = useState<any>(null);
  const [poolsWithToken, setPoolsWithToken] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  
  // Dropdown states
  const [selectedInfoType, setSelectedInfoType] = useState<string>('basic');
  const [selectedPool, setSelectedPool] = useState<string>('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('24h');
  const [selectedHolderSort, setSelectedHolderSort] = useState<string>('amount');

  const loadTokenDetails = useCallback(async () => {
    if (!selectedTokenForDetails) return;

    try {
      await getTokenMetadata(selectedTokenForDetails);
      const holdersData = await getTokenHolders(selectedTokenForDetails);
      setHolders(holdersData);
    } catch (e) {
      console.error('Failed to load details:', e);
    }
  }, [selectedTokenForDetails]);

  const loadProgramMetadata = useCallback(async () => {
    if (!dexClient || !selectedTokenForDetails) return;

    try {
      const mintPubkey = new PublicKey(selectedTokenForDetails);
      const metadataAddress = await dexClient.getTokenMetadataAddress(mintPubkey);
      const metadata = await dexClient.program.account.tokenMetadata.fetch(metadataAddress);
      setProgramMetadata(metadata);
    } catch (e) {
      console.log("No program metadata found (token not deployed via MAX DEX)");
    }
  }, [dexClient, selectedTokenForDetails]);

  const findPoolsWithToken = useCallback(() => {
    const tokenPools = pools.filter(
      (p) => p.tokenA === selectedTokenForDetails || p.tokenB === selectedTokenForDetails
    );
    setPoolsWithToken(tokenPools);
  }, [pools, selectedTokenForDetails]);

  const loadTransactionHistory = useCallback(async () => {
    if (!selectedTokenForDetails) return;

    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const mintPubkey = new PublicKey(selectedTokenForDetails);
      const tokenProgramId = new PublicKey("TokenkegQfeZyiNwAJsyFbPVwwQQfimJwWCmRJBn1g");

      const tokenAccounts = await connection.getProgramAccounts(tokenProgramId, {
        filters: [
          { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
        ],
      });

      const allSignatures: any[] = [];
      for (const account of tokenAccounts.slice(0, 10)) {
        const sigs = await connection.getSignaturesForAddress(account.pubkey, { limit: 20 });
        allSignatures.push(...sigs);
      }

      const uniqueSigs = Array.from(new Map(allSignatures.map(s => [s.signature, s])).values());
      const txData = uniqueSigs
        .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
        .slice(0, 50)
        .map((sig) => ({
          signature: sig.signature,
          timestamp: sig.blockTime || 0,
          status: sig.err ? 'failed' : 'success',
        }));

      setTransactions(txData);
      setChartData([
        { time: '24h ago', price: 0 },
        { time: 'now', price: 0 },
      ]);
    } catch (error) {
      console.error("Failed to load transaction history:", error);
      setTransactions([]);
      setChartData([]);
    }
  }, [selectedTokenForDetails]);

  useEffect(() => {
    loadTokenDetails();
    loadProgramMetadata();
    findPoolsWithToken();
    loadTransactionHistory();
  }, [loadTokenDetails, loadProgramMetadata, findPoolsWithToken, loadTransactionHistory]);

  const tokenData = deployedTokens.find((t) => t.mint === selectedTokenForDetails);

  if (!selectedTokenForDetails) {
    return <div className="dex-card">No token selected</div>;
  }

  const totalLiquidity = poolsWithToken.reduce((sum, p) => {
    const isTokenA = p.tokenA === selectedTokenForDetails;
    return sum + (isTokenA ? p.reserveA : p.reserveB) / Math.pow(10, tokenData?.decimals || 6);
  }, 0);

  const volume24h = transactions.filter(t => 
    Date.now() - t.timestamp < 24 * 60 * 60 * 1000
  ).reduce((sum, t) => {
    return sum + (parseFloat(t.amount?.split('/')[0] || t.amount || '0'));
  }, 0);

  // Filter holders based on selected sort
  const sortedHolders = [...holders].sort((a, b) => {
    const amountA = a.account.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    const amountB = b.account.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    return selectedHolderSort === 'amount' ? amountB - amountA : 0;
  });

  // Filter pools based on selection
  const filteredPools = selectedPool === 'all' 
    ? poolsWithToken 
    : poolsWithToken.filter(p => p.id === selectedPool);

  const getInfoContent = () => {
    switch(selectedInfoType) {
      case 'basic':
        return tokenData && (
          <div className="info-card">
            <h3 className="card-title">Information</h3>
            <div className="card-content">
              <div className="info-row">
                <span className="info-label">Symbol</span>
                <span className="info-value">{tokenData.symbol}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Name</span>
                <span className="info-value">{tokenData.name || 'Unknown Token'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Decimals</span>
                <span className="info-value">{tokenData.decimals}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Total Supply</span>
                <span className="info-value">{(tokenData.totalSupply / Math.pow(10, tokenData.decimals)).toLocaleString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Mint Address</span>
                <span className="info-value mono">{selectedTokenForDetails}</span>
              </div>
            </div>
          </div>
        );
      case 'dex':
        return programMetadata && (
          <div className="info-card">
            <h3 className="card-title">MAX DEX Verification</h3>
            <div className="card-content">
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value verified">Verified</span>
              </div>
              <div className="info-row">
                <span className="info-label">Total Supply</span>
                <span className="info-value">{(programMetadata.totalSupply / Math.pow(10, tokenData?.decimals || 6)).toLocaleString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Circulating</span>
                <span className="info-value">{(programMetadata.circulatingSupply / Math.pow(10, tokenData?.decimals || 6)).toLocaleString()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Creator</span>
                <span className="info-value mono">{programMetadata.creator.toString()}</span>
              </div>
            </div>
          </div>
        );
      case 'stats':
        return (
          <div className="info-card">
            <h3 className="card-title">Statistics</h3>
            <div className="card-content">
              <div className="info-row">
                <span className="info-label">24h Volume</span>
                <span className="info-value">${volume24h.toFixed(2)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Total Liquidity</span>
                <span className="info-value">${totalLiquidity.toFixed(2)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Holders Count</span>
                <span className="info-value">{holders.length}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Total Transactions</span>
                <span className="info-value">{transactions.length}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value">{transactions.length > 0 ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="token-details-full-layout">
      {/* Header Section with Token Info */}
      <div className="token-header-banner">
        <div className="token-header-content">
          <div className="token-header-info">
            {tokenData?.logo && (
              <img src={tokenData.logo} alt={tokenData.symbol} className="token-header-logo" />
            )}
            <div className="token-header-text">
              <h2 className="token-header-symbol">{tokenData?.symbol}</h2>
              <span className="token-header-name">{tokenData?.name}</span>
              <span className="token-network-badge">{tokenData?.network?.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Birdeye Chart Section */}
      <div className="birdeye-section">
        <h3 className="section-chart-title">Token Chart (Powered by Birdeye)</h3>
        <div className="birdeye-chart-wrapper">
          <iframe
            src={`https://birdeye.so/token/${selectedTokenForDetails}?chain=solana`}
            frameBorder="0"
            allow="clipboard-write"
            className="birdeye-iframe"
            title="Birdeye Token Chart"
          ></iframe>
        </div>
      </div>

      {/* Two Column Section - Info and Trade History */}
      <div className="two-column-layout">
        {/* Left Column - Dropdowns */}
        <div className="left-column">
          <div className="dropdowns-container">
            <h3 className="column-title">Token Information</h3>
            
            {/* Dropdown 1 */}
            <div className="dropdown-group">
              <label className="dropdown-label">Information Type</label>
              <select 
                className="dropdown-select"
                value={selectedInfoType}
                onChange={(e) => setSelectedInfoType(e.target.value)}
              >
                <option value="basic">Basic Information</option>
                <option value="dex">MAX DEX Verification</option>
                <option value="stats">Statistics</option>
              </select>
            </div>

            {/* Dropdown 2 */}
            <div className="dropdown-group">
              <label className="dropdown-label">Liquidity Pool Filter</label>
              <select 
                className="dropdown-select"
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
              >
                <option value="all">All Pools ({poolsWithToken.length})</option>
                {poolsWithToken.map((pool, idx) => (
                  <option key={idx} value={pool.id || idx}>
                    {pool.symbolA}/{pool.symbolB} - {pool.fee/100}% fee
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown 3 */}
            <div className="dropdown-group">
              <label className="dropdown-label">Timeframe</label>
              <select 
                className="dropdown-select"
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>

            {/* Dropdown 4 */}
            <div className="dropdown-group">
              <label className="dropdown-label">Sort Holders By</label>
              <select 
                className="dropdown-select"
                value={selectedHolderSort}
                onChange={(e) => setSelectedHolderSort(e.target.value)}
              >
                <option value="amount">Highest Balance</option>
                <option value="address">Address (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column - Cards */}
        <div className="right-column">
          <div className="cards-container">
            <h3 className="column-title">Token Data</h3>
            
            {/* Card 1: Dynamic Info Card based on dropdown */}
            {getInfoContent()}

            {/* Card 2: Trade Execution History */}
            <div className="info-card">
              <h3 className="card-title">Trade Execution History</h3>
              <div className="card-content">
                {transactions.length > 0 ? (
                  <div className="transactions-list">
                    {transactions.slice(0, 10).map((tx, idx) => (
                      <div key={idx} className="transaction-item">
                        <div className="tx-header">
                          <span className="tx-signature">{tx.signature.slice(0, 16)}...{tx.signature.slice(-8)}</span>
                          <span className="tx-status" data-status={tx.status}>{tx.status.toUpperCase()}</span>
                        </div>
                        <div className="tx-time">{new Date(tx.timestamp * 1000).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No transactions yet</p>
                )}
              </div>
            </div>

            {/* Card 3: Liquidity Pools */}
            <div className="info-card">
              <h3 className="card-title">Liquidity Pools ({filteredPools.length})</h3>
              <div className="card-content">
                {filteredPools.length > 0 ? (
                  <div className="pools-list">
                    {filteredPools.map((pool, idx) => (
                      <div key={idx} className="pool-item">
                        <div className="pool-name">{pool.symbolA}/{pool.symbolB}</div>
                        <div className="pool-details">
                          <span>Fee: {pool.fee / 100}%</span>
                          <span>TVL: ${((pool.reserveA + pool.reserveB) / 1e6).toFixed(2)}</span>
                          <span>Reserve A: {(pool.reserveA / 1e6).toFixed(2)}</span>
                          <span>Reserve B: {(pool.reserveB / 1e6).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No liquidity pools found</p>
                )}
              </div>
            </div>

            {/* Card 4: Top Holders */}
            <div className="info-card">
              <h3 className="card-title">Top Holders</h3>
              <div className="card-content">
                {sortedHolders.length > 0 ? (
                  <div className="holders-list">
                    {sortedHolders.slice(0, 10).map((h, i) => {
                      const parsed = h.account.data?.parsed?.info;
                      const amount = parsed?.tokenAmount?.uiAmount || 0;
                      const percentage = tokenData?.totalSupply 
                        ? (amount / (tokenData.totalSupply / Math.pow(10, tokenData.decimals))) * 100 
                        : 0;
                      return (
                        <div key={i} className="holder-item">
                          <div className="holder-rank">#{i + 1}</div>
                          <div className="holder-address mono">{h.pubkey.slice(0, 8)}...{h.pubkey.slice(-6)}</div>
                          <div className="holder-amount">{amount.toLocaleString()} {tokenData?.symbol}</div>
                          <div className="holder-percentage">({percentage.toFixed(2)}%)</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-state">No holders found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .token-details-full-layout {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
          height: 100%;
          padding: 20px;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          border-radius: 16px;
          overflow-y: auto;
        }

        .token-header-banner {
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .token-header-content {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
        }

        .token-header-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .token-header-logo {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: 3px solid white;
          object-fit: cover;
        }

        .token-header-text {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .token-header-symbol {
          font-size: 32px;
          font-weight: 700;
          color: white;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .token-header-name {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .token-network-badge {
          display: inline-block;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          width: fit-content;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .birdeye-section {
          background: rgba(12, 17, 26, 0.8);
          border: 1px solid #232a36;
          border-radius: 12px;
          padding: 20px;
          backdrop-filter: blur(10px);
        }

        .section-chart-title {
          font-size: 16px;
          font-weight: 600;
          color: #6c9bd2;
          margin: 0 0 16px 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .birdeye-chart-wrapper {
          width: 100%;
          height: 450px;
          border-radius: 8px;
          overflow: hidden;
          background: #0c111a;
          border: 1px solid #1e2a3a;
        }

        .birdeye-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .two-column-layout {
          display: flex;
          gap: 20px;
          width: 100%;
          height: auto;
          min-height: 600px;
        }

        /* Left Column Styles */
        .left-column {
          flex: 0 0 280px;
          background: rgba(12, 17, 26, 0.8);
          border-radius: 12px;
          border: 1px solid #232a36;
          overflow-y: auto;
          backdrop-filter: blur(10px);
        }

        .dropdowns-container {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .column-title {
          font-size: 16px;
          font-weight: 600;
          color: #6c9bd2;
          margin: 0 0 8px 0;
          padding-bottom: 12px;
          border-bottom: 2px solid #232a36;
        }

        .dropdown-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dropdown-label {
          font-size: 12px;
          font-weight: 500;
          color: #8e9bae;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dropdown-select {
          padding: 10px 12px;
          background: #0c111a;
          border: 1px solid #232a36;
          border-radius: 8px;
          color: #e6edf5;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-select:hover {
          border-color: #6c9bd2;
        }

        .dropdown-select:focus {
          outline: none;
          border-color: #6c9bd2;
          box-shadow: 0 0 0 2px rgba(108, 155, 210, 0.1);
        }

        /* Right Column Styles */
        .right-column {
          flex: 1;
          background: rgba(12, 17, 26, 0.8);
          border-radius: 12px;
          border: 1px solid #232a36;
          overflow-y: auto;
          backdrop-filter: blur(10px);
        }

        .cards-container {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Card Styles */
        .info-card {
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .info-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border-color: #6c9bd2;
        }

        .card-title {
          font-size: 14px;
          font-weight: 600;
          color: #6c9bd2;
          margin: 0;
          padding: 16px 20px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
        }

        .card-content {
          padding: 16px 20px;
        }

        /* Info Row Styles */
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #1e2a3a;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-label {
          font-size: 12px;
          color: #8e9bae;
          font-weight: 500;
        }

        .info-value {
          font-size: 13px;
          color: #e6edf5;
          font-weight: 600;
          text-align: right;
        }

        .info-value.verified {
          color: #6fcf97;
        }

        .info-value.positive {
          color: #6fcf97;
        }

        .mono {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          word-break: break-all;
        }

        /* Transactions List Styles */
        .transactions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .transaction-item {
          padding: 12px;
          background: #0a0e15;
          border-radius: 8px;
          transition: all 0.2s;
          border-left: 3px solid #6c9bd2;
        }

        .transaction-item:hover {
          background: #0f1419;
        }

        .tx-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          gap: 8px;
        }

        .tx-signature {
          font-size: 11px;
          font-weight: 600;
          color: #6c9bd2;
          font-family: 'Courier New', monospace;
          flex: 1;
          word-break: break-all;
        }

        .tx-status {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .tx-status[data-status="success"] {
          background: rgba(111, 207, 151, 0.2);
          color: #6fcf97;
          border: 1px solid #6fcf97;
        }

        .tx-status[data-status="failed"] {
          background: rgba(220, 38, 38, 0.2);
          color: #dc2626;
          border: 1px solid #dc2626;
        }

        .tx-time {
          font-size: 10px;
          color: #8e9bae;
        }

        /* Pools List Styles */
        .pools-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pool-item {
          padding: 12px;
          background: #0a0e15;
          border-radius: 8px;
          border-left: 3px solid #6c9bd2;
        }

        .pool-name {
          font-size: 13px;
          font-weight: 600;
          color: #e6edf5;
          margin-bottom: 8px;
        }

        .pool-details {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 11px;
          color: #8e9bae;
        }

        /* Holders List Styles */
        .holders-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .holder-item {
          display: grid;
          grid-template-columns: 40px 1fr auto auto;
          gap: 12px;
          align-items: center;
          padding: 10px;
          background: #0a0e15;
          border-radius: 8px;
          font-size: 11px;
        }

        .holder-rank {
          font-weight: 700;
          color: #6c9bd2;
        }

        .holder-address {
          font-family: 'Courier New', monospace;
          color: #8e9bae;
        }

        .holder-amount {
          color: #6fcf97;
          font-weight: 500;
        }

        .holder-percentage {
          color: #8e9bae;
          font-size: 10px;
        }

        .empty-state {
          text-align: center;
          color: #8e9bae;
          font-size: 13px;
          padding: 20px;
        }

        /* Scrollbar Styles */
        .left-column::-webkit-scrollbar,
        .right-column::-webkit-scrollbar {
          width: 6px;
        }

        .left-column::-webkit-scrollbar-track,
        .right-column::-webkit-scrollbar-track {
          background: #0c111a;
          border-radius: 3px;
        }

        .left-column::-webkit-scrollbar-thumb,
        .right-column::-webkit-scrollbar-thumb {
          background: #232a36;
          border-radius: 3px;
        }

        .left-column::-webkit-scrollbar-thumb:hover,
        .right-column::-webkit-scrollbar-thumb:hover {
          background: #6c9bd2;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .two-column-layout {
            flex-direction: column;
          }

          .left-column {
            flex: none;
            height: auto;
            max-height: 400px;
          }

          .right-column {
            flex: none;
          }
        }

        @media (max-width: 768px) {
          .token-details-full-layout {
            padding: 12px;
            gap: 12px;
          }

          .token-header-banner {
            flex-direction: column;
            text-align: center;
          }

          .token-header-info {
            flex-direction: column;
          }

          .token-header-symbol {
            font-size: 24px;
          }

          .birdeye-section {
            padding: 12px;
          }

          .birdeye-chart-wrapper {
            height: 300px;
          }

          .two-column-layout {
            padding: 0;
            gap: 12px;
          }

          .holder-item {
            grid-template-columns: 1fr;
            gap: 6px;
          }

          .tx-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default TokenDetailsPage;

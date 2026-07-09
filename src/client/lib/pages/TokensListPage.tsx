import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';

interface TradeHistory {
  id: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  txHash: string;
}

interface TokenHolder {
  address: string;
  amount: number;
  percentage: number;
}

const TokensListPage: React.FC = () => {
  const { deployedTokens } = useAppContext();
  const [selectedToken, setSelectedToken] = useState<any>(deployedTokens[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [tabActive, setTabActive] = useState<'info' | 'chart' | 'history' | 'holders'>('info');
  const [tokenPrices, setTokenPrices] = useState<Record<string, any>>({});
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
  const [tokenHolders, setTokenHolders] = useState<TokenHolder[]>([]);

  // Fetch token price from DexScreener
  const fetchTokenPrice = async (mintAddress: string) => {
    try {
      // Use CORS proxy to bypass CORS restrictions
      const url = `https://cors-proxy.fringe.zone/https://api.dexscreener.com/latest/dex/token/${mintAddress}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`DexScreener API returned status ${response.status} for token ${mintAddress}`);
        return null;
      }

      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          price: parseFloat(pair.priceUsd),
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          marketCap: parseFloat(pair.marketCap?.usd || 0),
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
      for (const token of deployedTokens) {
        const priceData = await fetchTokenPrice(token.mint);
        if (priceData) {
          prices[token.mint] = priceData;
        }
      }
      setTokenPrices(prices);
    };

    if (deployedTokens.length > 0) {
      fetchAllPrices();
    }
  }, [deployedTokens]);

  // Mock trade history data
  useEffect(() => {
    if (selectedToken) {
      const mockHistory: TradeHistory[] = [
        {
          id: '1',
          type: 'buy',
          amount: 1000,
          price: 0.52,
          timestamp: Date.now() - 3600000,
          txHash: 'Ey4hAUV...ABC'
        },
        {
          id: '2',
          type: 'sell',
          amount: 500,
          price: 0.58,
          timestamp: Date.now() - 7200000,
          txHash: 'Ey4hAUV...XYZ'
        },
        {
          id: '3',
          type: 'buy',
          amount: 2000,
          price: 0.49,
          timestamp: Date.now() - 10800000,
          txHash: 'Ey4hAUV...DEF'
        }
      ];
      setTradeHistory(mockHistory);
    }
  }, [selectedToken]);

  // Mock token holders data
  useEffect(() => {
    if (selectedToken) {
      const totalSupply = parseInt(selectedToken.totalSupply || '0');
      const mockHolders: TokenHolder[] = [
        { address: 'Holder1...ABC', amount: totalSupply * 0.2, percentage: 20 },
        { address: 'Holder2...DEF', amount: totalSupply * 0.15, percentage: 15 },
        { address: 'Holder3...GHI', amount: totalSupply * 0.12, percentage: 12 },
        { address: 'Holder4...JKL', amount: totalSupply * 0.1, percentage: 10 },
        { address: 'Holder5...MNO', amount: totalSupply * 0.08, percentage: 8 },
      ];
      setTokenHolders(mockHolders);
    }
  }, [selectedToken]);

  const filteredTokens = deployedTokens.filter(token =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.mint.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedTokens = [...filteredTokens].sort((a, b) => {
    if (sortBy === 'recent') return (b.timestamp || 0) - (a.timestamp || 0);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
    if (sortBy === 'supply') return parseInt(b.totalSupply || '0') - parseInt(a.totalSupply || '0');
    return 0;
  });

  const getTokenPrice = (mint: string) => tokenPrices[mint]?.price || 'N/A';
  const getChange24h = (mint: string) => tokenPrices[mint]?.change24h || 0;
  const getVolume = (mint: string) => tokenPrices[mint]?.volume24h || 0;

  return (
    <div className="tokens-list-page">
      <div className="tokens-container">
        {/* LEFT COLUMN - TOKEN LIST */}
        <div className="tokens-left-column">
          <div className="tokens-header">
            <h2>DEPLOYED TOKENS</h2>
            <span className="token-count">{sortedTokens.length}</span>
          </div>

          <div className="tokens-controls">
            <input
              type="text"
              className="tokens-search"
              placeholder="Search tokens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="tokens-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Most Recent</option>
              <option value="name">By Name</option>
              <option value="symbol">By Symbol</option>
              <option value="supply">By Supply</option>
            </select>
          </div>

          <div className="tokens-list">
            {sortedTokens.length === 0 ? (
              <div className="empty-tokens">
                <p>No tokens deployed yet</p>
              </div>
            ) : (
              sortedTokens.map((token) => (
                <div
                  key={token.mint}
                  className={`token-list-item ${selectedToken?.mint === token.mint ? 'active' : ''}`}
                  onClick={() => setSelectedToken(token)}
                >
                  <div className="token-list-header">
                    <div className="token-symbol-badge">{token.symbol.substring(0, 2)}</div>
                    <div className="token-list-info">
                      <div className="token-list-name">{token.symbol}</div>
                      <div className="token-list-supply">Supply: {(parseInt(token.totalSupply || '0') / Math.pow(10, token.decimals || 6)).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="token-list-price">
                    <div className="price-value">${typeof getTokenPrice(token.mint) === 'number' ? getTokenPrice(token.mint).toFixed(4) : getTokenPrice(token.mint)}</div>
                    <div className={`price-change ${getChange24h(token.mint) >= 0 ? 'positive' : 'negative'}`}>
                      {getChange24h(token.mint) >= 0 ? '+' : ''}{getChange24h(token.mint).toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - TOKEN DETAILS */}
        <div className="tokens-right-column">
          {selectedToken ? (
            <>
              {/* TOKEN HEADER */}
              <div className="token-detail-header">
                <div className="token-header-info">
                  <div className="token-header-logo">{selectedToken.symbol.substring(0, 2)}</div>
                  <div className="token-header-text">
                    <h2>{selectedToken.name}</h2>
                    <p>{selectedToken.symbol}</p>
                  </div>
                </div>
                <div className="token-header-price">
                  <div className="token-price-large">${typeof getTokenPrice(selectedToken.mint) === 'number' ? getTokenPrice(selectedToken.mint).toFixed(4) : getTokenPrice(selectedToken.mint)}</div>
                  <div className={`token-change-large ${getChange24h(selectedToken.mint) >= 0 ? 'positive' : 'negative'}`}>
                    {getChange24h(selectedToken.mint) >= 0 ? '+' : ''}{getChange24h(selectedToken.mint).toFixed(2)}% (24h)
                  </div>
                </div>
              </div>

              {/* TAB NAVIGATION */}
              <div className="token-tabs">
                <button className={`tab-btn ${tabActive === 'info' ? 'active' : ''}`} onClick={() => setTabActive('info')}>
                  📋 Info
                </button>
                <button className={`tab-btn ${tabActive === 'chart' ? 'active' : ''}`} onClick={() => setTabActive('chart')}>
                  📊 Chart
                </button>
                <button className={`tab-btn ${tabActive === 'history' ? 'active' : ''}`} onClick={() => setTabActive('history')}>
                  📈 History
                </button>
                <button className={`tab-btn ${tabActive === 'holders' ? 'active' : ''}`} onClick={() => setTabActive('holders')}>
                  👥 Holders
                </button>
              </div>

              {/* TAB CONTENT */}
              <div className="token-tab-content">
                {tabActive === 'info' && (
                  <div className="info-section">
                    <div className="info-row">
                      <span className="info-label">Mint Address:</span>
                      <span className="info-value mono">{selectedToken.mint}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Token Name:</span>
                      <span className="info-value">{selectedToken.name}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Symbol:</span>
                      <span className="info-value">{selectedToken.symbol}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Decimals:</span>
                      <span className="info-value">{selectedToken.decimals}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Total Supply:</span>
                      <span className="info-value">{(parseInt(selectedToken.totalSupply || '0') / Math.pow(10, selectedToken.decimals || 6)).toLocaleString()} {selectedToken.symbol}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Network:</span>
                      <span className="info-value">{selectedToken.network || 'mainnet-beta'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Standard:</span>
                      <span className="info-value">{selectedToken.standard || 'SPL'}</span>
                    </div>
                    {selectedToken.metadataAddress && (
                      <div className="info-row">
                        <span className="info-label">Metadata Address:</span>
                        <span className="info-value mono">{selectedToken.metadataAddress.slice(0, 20)}...</span>
                      </div>
                    )}
                  </div>
                )}

                {tabActive === 'chart' && (
                  <div className="chart-section">
                    <div className="chart-placeholder">
                      <p>📊 Token Chart</p>
                      <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                        {selectedToken.symbol} price chart will be displayed here
                      </p>
                      <p style={{ fontSize: '10px', color: '#666', marginTop: '20px' }}>
                        Powered by DexScreener API
                      </p>
                    </div>
                  </div>
                )}

                {tabActive === 'history' && (
                  <div className="history-section">
                    <div className="history-header">
                      <h3>Trade Execution History</h3>
                    </div>
                    <div className="history-list">
                      {tradeHistory.length === 0 ? (
                        <div className="empty-history">No trades yet</div>
                      ) : (
                        tradeHistory.map((trade) => (
                          <div key={trade.id} className="history-item">
                            <div className="history-type-badge" style={{ background: trade.type === 'buy' ? '#2ecc71' : '#e74c3c' }}>
                              {trade.type.toUpperCase()}
                            </div>
                            <div className="history-info">
                              <div className="history-amount">{trade.amount.toLocaleString()} {selectedToken.symbol}</div>
                              <div className="history-price">${trade.price.toFixed(4)}</div>
                            </div>
                            <div className="history-time">
                              {new Date(trade.timestamp).toLocaleString()}
                            </div>
                            <div className="history-hash">
                              <a href={`https://explorer.solana.com/tx/${trade.txHash}?cluster=mainnet`} target="_blank" rel="noopener noreferrer">
                                {trade.txHash}
                              </a>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {tabActive === 'holders' && (
                  <div className="holders-section">
                    <div className="holders-header">
                      <h3>Top Token Holders</h3>
                    </div>
                    <div className="holders-list">
                      {tokenHolders.length === 0 ? (
                        <div className="empty-holders">No holders data</div>
                      ) : (
                        tokenHolders.map((holder, idx) => (
                          <div key={idx} className="holder-item">
                            <div className="holder-rank">#{idx + 1}</div>
                            <div className="holder-address">{holder.address}</div>
                            <div className="holder-bar">
                              <div className="holder-bar-fill" style={{ width: `${holder.percentage}%` }}></div>
                            </div>
                            <div className="holder-percentage">{holder.percentage.toFixed(1)}%</div>
                            <div className="holder-amount">{(holder.amount / Math.pow(10, selectedToken.decimals || 6)).toLocaleString()}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="no-token-selected">
              <p>Select a token from the list to view details</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tokens-list-page {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          padding: 20px;
          display: flex;
          flex-direction: column;
        }

        .tokens-container {
          display: flex;
          gap: 20px;
          height: 100%;
          flex: 1;
        }

        /* LEFT COLUMN */
        .tokens-left-column {
          flex: 0 0 300px;
          background: rgba(12, 17, 26, 0.8);
          border-radius: 12px;
          border: 1px solid #232a36;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tokens-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #232a36;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
        }

        .tokens-header h2 {
          margin: 0;
          font-size: 16px;
          color: #6c9bd2;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .token-count {
          background: #6c9bd2;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 700;
        }

        .tokens-controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border-bottom: 1px solid #232a36;
        }

        .tokens-search,
        .tokens-sort {
          width: 100%;
          padding: 10px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 6px;
          color: #e6edf5;
          font-size: 12px;
        }

        .tokens-search:focus,
        .tokens-sort:focus {
          outline: none;
          border-color: #6c9bd2;
        }

        .tokens-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
        }

        .token-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #0c111a;
          border: 1px solid #232a36;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .token-list-item:hover {
          border-color: #6c9bd2;
          background: #0f1419;
        }

        .token-list-item.active {
          background: rgba(108, 155, 210, 0.15);
          border-color: #6c9bd2;
        }

        .token-list-header {
          display: flex;
          gap: 12px;
          align-items: center;
          flex: 1;
        }

        .token-symbol-badge {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 12px;
        }

        .token-list-info {
          display: flex;
          flex-direction: column;
        }

        .token-list-name {
          font-size: 13px;
          font-weight: 700;
          color: #e6edf5;
        }

        .token-list-supply {
          font-size: 10px;
          color: #888;
        }

        .token-list-price {
          text-align: right;
        }

        .price-value {
          font-size: 12px;
          font-weight: 700;
          color: #e6edf5;
        }

        .price-change {
          font-size: 11px;
          font-weight: 600;
        }

        .price-change.positive {
          color: #2ecc71;
        }

        .price-change.negative {
          color: #e74c3c;
        }

        .empty-tokens {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #666;
          text-align: center;
        }

        /* RIGHT COLUMN */
        .tokens-right-column {
          flex: 1;
          background: rgba(12, 17, 26, 0.8);
          border-radius: 12px;
          border: 1px solid #232a36;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .token-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #232a36;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
        }

        .token-header-info {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .token-header-logo {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 18px;
        }

        .token-header-text h2 {
          margin: 0;
          color: #e6edf5;
          font-size: 18px;
        }

        .token-header-text p {
          margin: 4px 0 0 0;
          color: #888;
          font-size: 12px;
        }

        .token-header-price {
          text-align: right;
        }

        .token-price-large {
          font-size: 28px;
          font-weight: 700;
          color: #6fcf97;
        }

        .token-change-large {
          font-size: 14px;
          font-weight: 600;
          margin-top: 4px;
        }

        .token-change-large.positive {
          color: #2ecc71;
        }

        .token-change-large.negative {
          color: #e74c3c;
        }

        .token-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #232a36;
          background: #0c111a;
        }

        .tab-btn {
          flex: 1;
          padding: 14px 12px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #888;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          color: #6c9bd2;
        }

        .tab-btn.active {
          color: #6c9bd2;
          border-bottom-color: #6c9bd2;
        }

        .token-tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        /* INFO SECTION */
        .info-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #0a0e15;
          border-radius: 6px;
          border: 1px solid #232a36;
        }

        .info-label {
          font-size: 12px;
          color: #888;
          font-weight: 600;
        }

        .info-value {
          font-size: 12px;
          color: #e6edf5;
          font-weight: 500;
          word-break: break-all;
        }

        .info-value.mono {
          font-family: monospace;
          font-size: 10px;
        }

        /* CHART SECTION */
        .chart-section {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chart-placeholder {
          text-align: center;
          color: #666;
          padding: 40px;
        }

        .chart-placeholder p {
          margin: 0;
        }

        /* HISTORY SECTION */
        .history-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-header h3 {
          margin: 0;
          font-size: 14px;
          color: #6c9bd2;
          font-weight: 700;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .history-item {
          display: grid;
          grid-template-columns: 60px 1fr 150px 100px;
          gap: 12px;
          padding: 12px;
          background: #0a0e15;
          border-radius: 6px;
          border: 1px solid #232a36;
          align-items: center;
        }

        .history-type-badge {
          padding: 6px;
          border-radius: 4px;
          color: white;
          font-size: 10px;
          font-weight: 700;
          text-align: center;
        }

        .history-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .history-amount {
          font-size: 12px;
          color: #e6edf5;
          font-weight: 600;
        }

        .history-price {
          font-size: 10px;
          color: #888;
        }

        .history-time {
          font-size: 10px;
          color: #888;
        }

        .history-hash a {
          font-size: 10px;
          color: #6c9bd2;
          text-decoration: none;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .history-hash a:hover {
          text-decoration: underline;
        }

        .empty-history {
          text-align: center;
          color: #666;
          padding: 40px 20px;
        }

        /* HOLDERS SECTION */
        .holders-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .holders-header h3 {
          margin: 0;
          font-size: 14px;
          color: #6c9bd2;
          font-weight: 700;
        }

        .holders-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .holder-item {
          display: grid;
          grid-template-columns: 40px 100px 1fr 60px 80px;
          gap: 10px;
          align-items: center;
          padding: 12px;
          background: #0a0e15;
          border-radius: 6px;
          border: 1px solid #232a36;
        }

        .holder-rank {
          font-size: 12px;
          font-weight: 700;
          color: #6c9bd2;
          text-align: center;
        }

        .holder-address {
          font-size: 10px;
          color: #888;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .holder-bar {
          height: 6px;
          background: #232a36;
          border-radius: 3px;
          overflow: hidden;
        }

        .holder-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #6c9bd2 0%, #2ecc71 100%);
          border-radius: 3px;
        }

        .holder-percentage {
          font-size: 11px;
          font-weight: 600;
          color: #e6edf5;
          text-align: right;
        }

        .holder-amount {
          font-size: 10px;
          color: #888;
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty-holders {
          text-align: center;
          color: #666;
          padding: 40px 20px;
        }

        .no-token-selected {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
        }

        @media (max-width: 1024px) {
          .tokens-container {
            flex-direction: column;
          }

          .tokens-left-column {
            flex: 0 0 auto;
            max-height: 300px;
          }

          .history-item,
          .holder-item {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default TokensListPage;

import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

const MyTokensPage: React.FC = () => {
  const { deployedTokens, setCurrentPage, setSelectedTokenForDetails } = useAppContext();
  
  // Dropdown states
  const [selectedSortBy, setSelectedSortBy] = useState<string>('recent');
  const [selectedFilterStatus, setSelectedFilterStatus] = useState<string>('all');
  const [selectedTokenType, setSelectedTokenType] = useState<string>('all');
  const [selectedViewMode, setSelectedViewMode] = useState<string>('details');

  const handleViewToken = (mint: string) => {
    setSelectedTokenForDetails(mint);
    setCurrentPage('tokens');
  };

  const handleCopyMint = (mint: string) => {
    navigator.clipboard.writeText(mint);
    alert('Mint copied!');
  };

  const getFilteredTokens = () => {
    let filtered = [...deployedTokens];

    if (selectedFilterStatus === 'verified') {
      filtered = filtered.filter(t => t.isVerified);
    } else if (selectedFilterStatus === 'unverified') {
      filtered = filtered.filter(t => !t.isVerified);
    }

    if (selectedTokenType === 'meme') {
      filtered = filtered.filter(t => t.symbol?.toLowerCase().includes('meme') || t.name?.toLowerCase().includes('meme'));
    } else if (selectedTokenType === 'utility') {
      filtered = filtered.filter(t => t.symbol?.toLowerCase().includes('utility') || t.name?.toLowerCase().includes('utility'));
    }

    if (selectedSortBy === 'recent') {
      filtered = filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (selectedSortBy === 'name') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (selectedSortBy === 'symbol') {
      filtered.sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''));
    } else if (selectedSortBy === 'supply') {
      filtered.sort((a, b) => (parseInt(b.totalSupply || '0') - parseInt(a.totalSupply || '0')));
    }

    return filtered;
  };

  const filteredTokens = getFilteredTokens();

  // Get statistics
  const totalTokens = deployedTokens.length;
  const verifiedTokens = deployedTokens.filter(t => t.isVerified).length;
  const totalSupply = deployedTokens.reduce((sum, t) => sum + (parseInt(t.totalSupply || '0') / Math.pow(10, t.decimals || 6)), 0);

  // Get token details for card view
  const getTokenDetailsContent = (token: any) => {
    switch(selectedViewMode) {
      case 'details':
        return (
          <>
            <div className="token-detail-row">
              <span className="detail-label">Mint Address:</span>
              <span className="detail-value mono">{token.mint.slice(0, 16)}...{token.mint.slice(-8)}</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">Decimals:</span>
              <span className="detail-value">{token.decimals}</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">Total Supply:</span>
              <span className="detail-value">{(parseInt(token.totalSupply || '0') / Math.pow(10, token.decimals || 6)).toLocaleString()} {token.symbol}</span>
            </div>
            {token.circulatingSupply && (
              <div className="token-detail-row">
                <span className="detail-label">Circulating:</span>
                <span className="detail-value">{(parseInt(token.circulatingSupply) / Math.pow(10, token.decimals || 6)).toLocaleString()} {token.symbol}</span>
              </div>
            )}
          </>
        );
      case 'stats':
        return (
          <>
            <div className="token-detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value">{token.isVerified ? 'Verified' : 'Unverified'}</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">Deployment Status:</span>
              <span className="detail-value">{token.deploymentStatus || 'Pending'}</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{new Date(token.timestamp || 0).toLocaleDateString()}</span>
            </div>
            <div className="token-detail-row">
              <span className="detail-label">Freeze Authority:</span>
              <span className="detail-value">{token.freezeAuthority ? 'Enabled' : 'Disabled'}</span>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="my-tokens-two-column-layout">
      {/* Token Filters Bar */}
      <div className="filters-bar-container">
        <div className="filters-bar">
          <div className="filters-title">⚙️ Token Filters</div>

          {/* Stats Line */}
          <div className="stats-line">
            <div className="stat-item-inline">
              <span className="stat-label">Total Tokens</span>
              <span className="stat-number">{totalTokens}</span>
            </div>
            <div className="stat-item-inline">
              <span className="stat-label">Verified</span>
              <span className="stat-number verified">{verifiedTokens}</span>
            </div>
            <div className="stat-item-inline">
              <span className="stat-label">Unverified</span>
              <span className="stat-number unverified">{totalTokens - verifiedTokens}</span>
            </div>
            <div className="stat-item-inline">
              <span className="stat-label">Total Supply</span>
              <span className="stat-number">{totalSupply.toLocaleString()}</span>
            </div>
          </div>

          {/* Dropdowns Line */}
          <div className="dropdowns-line">
            <div className="dropdown-group-inline">
              <label className="dropdown-label">Sort By</label>
              <select
                className="dropdown-select"
                value={selectedSortBy}
                onChange={(e) => setSelectedSortBy(e.target.value)}
              >
                <option value="recent">📅 Most Recent</option>
                <option value="name">📝 Token Name</option>
                <option value="symbol">🔤 Symbol</option>
                <option value="supply">💰 Total Supply</option>
              </select>
            </div>

            <div className="dropdown-group-inline">
              <label className="dropdown-label">Verification Status</label>
              <select
                className="dropdown-select"
                value={selectedFilterStatus}
                onChange={(e) => setSelectedFilterStatus(e.target.value)}
              >
                <option value="all">🌐 All Tokens</option>
                <option value="verified">✓ Verified Only</option>
                <option value="unverified">⚠️ Unverified Only</option>
              </select>
            </div>

            <div className="dropdown-group-inline">
              <label className="dropdown-label">Token Type</label>
              <select
                className="dropdown-select"
                value={selectedTokenType}
                onChange={(e) => setSelectedTokenType(e.target.value)}
              >
                <option value="all">🪙 All Types</option>
                <option value="meme">🐸 Meme Coins</option>
                <option value="utility">⚡ Utility Tokens</option>
              </select>
            </div>

            <div className="dropdown-group-inline">
              <label className="dropdown-label">View Mode</label>
              <select
                className="dropdown-select"
                value={selectedViewMode}
                onChange={(e) => setSelectedViewMode(e.target.value)}
              >
                <option value="details">📋 Token Details</option>
                <option value="stats">📊 Market Stats</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tokens Container */}
      <div className="tokens-container">
        <div className="cards-container">
          <h3 className="column-title">
            📦 Your Tokens
            <span className="token-count-badge">{filteredTokens.length} tokens</span>
          </h3>
          
          {filteredTokens.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-icon">🔍</div>
              <div className="empty-text">No tokens match your filters</div>
              <button 
                className="reset-btn"
                onClick={() => {
                  setSelectedSortBy('recent');
                  setSelectedFilterStatus('all');
                  setSelectedTokenType('all');
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredTokens.map((token) => (
              <div
                key={token.mint}
                className="token-card"
                onClick={() => handleViewToken(token.mint)}
                style={{ cursor: 'pointer' }}
              >
                <div className="token-card-header">
                  <div className="token-title-section">
                    <h4 className="token-symbol">{token.symbol}</h4>
                    <span className="token-name">{token.name || 'Unknown Token'}</span>
                  </div>
                  {token.isVerified && (
                    <div className="verified-badge">✓ Verified</div>
                  )}
                </div>

                <div className="token-card-content">
                  {getTokenDetailsContent(token)}
                </div>

                <div className="token-card-actions">
                  <button
                    className="token-action-btn copy-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyMint(token.mint);
                    }}
                  >
                    📋 Copy Mint
                  </button>
                  <button
                    className="token-action-btn view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewToken(token.mint);
                    }}
                  >
                    👁 View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .my-tokens-two-column-layout {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
          height: 100%;
          min-height: 600px;
          padding: 20px;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          border-radius: 16px;
        }

        /* Filters Bar Styles */
        .filters-bar-container {
          width: 100%;
          background: rgba(12, 17, 26, 0.8);
          border-radius: 12px;
          border: 1px solid #232a36;
          backdrop-filter: blur(10px);
        }

        .filters-bar {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .filters-title {
          font-size: 14px;
          font-weight: 600;
          color: #6c9bd2;
        }

        .stats-line {
          display: flex;
          gap: 20px;
          align-items: center;
          flex-wrap: wrap;
        }

        .stat-item-inline {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dropdowns-line {
          display: flex;
          gap: 16px;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .dropdown-group-inline {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 160px;
        }

        .column-title {
          font-size: 16px;
          font-weight: 600;
          color: #6c9bd2;
          margin: 0 0 8px 0;
          padding-bottom: 12px;
          border-bottom: 2px solid #232a36;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .token-count-badge {
          font-size: 12px;
          background: #1e2a3a;
          padding: 4px 8px;
          border-radius: 6px;
          color: #6c9bd2;
        }

        .stat-label {
          font-size: 11px;
          color: #8e9bae;
          font-weight: 500;
        }

        .stat-number {
          font-size: 13px;
          font-weight: 700;
          color: #e6edf5;
        }

        .stat-number.verified {
          color: #6fcf97;
        }

        .stat-number.unverified {
          color: #e74c3c;
        }

        .dropdown-label {
          font-size: 11px;
          font-weight: 500;
          color: #8e9bae;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dropdown-select {
          padding: 8px 10px;
          background: #0c111a;
          border: 1px solid #232a36;
          border-radius: 6px;
          color: #e6edf5;
          font-size: 12px;
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

        /* Tokens Container Styles */
        .tokens-container {
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
          gap: 16px;
        }

        /* Token Card Styles */
        .token-card {
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
          overflow: hidden;
          transition: all 0.3s ease;
          user-select: none;
        }

        .token-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(108, 155, 210, 0.15);
          border-color: #6c9bd2;
          background: #0f1419;
        }

        .token-card:active {
          transform: translateY(-2px);
        }

        .token-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
        }

        .token-title-section {
          display: flex;
          gap: 12px;
          align-items: baseline;
        }

        .token-symbol {
          font-size: 18px;
          font-weight: 700;
          color: #e6edf5;
          margin: 0;
        }

        .token-name {
          font-size: 12px;
          color: #8e9bae;
        }

        .verified-badge {
          padding: 4px 10px;
          background: rgba(111, 207, 151, 0.1);
          border: 1px solid #6fcf97;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #6fcf97;
        }

        .token-card-content {
          padding: 16px 20px;
        }

        .token-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #1e2a3a;
        }

        .token-detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          font-size: 12px;
          color: #8e9bae;
          font-weight: 500;
        }

        .detail-value {
          font-size: 13px;
          color: #e6edf5;
          font-weight: 600;
          text-align: right;
        }

        .mono {
          font-family: 'Courier New', monospace;
          font-size: 11px;
        }

        .token-card-actions {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #1e2a3a;
          background: rgba(0, 0, 0, 0.2);
        }

        .token-action-btn {
          flex: 1;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .copy-btn {
          background: rgba(108, 155, 210, 0.1);
          border: 1px solid #6c9bd2;
          color: #6c9bd2;
        }

        .copy-btn:hover {
          background: rgba(108, 155, 210, 0.2);
          transform: translateY(-1px);
        }

        .view-btn {
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          color: white;
        }

        .view-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(108, 155, 210, 0.3);
        }

        /* Empty State */
        .empty-state-card {
          text-align: center;
          padding: 60px 20px;
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-text {
          font-size: 14px;
          color: #8e9bae;
          margin-bottom: 20px;
        }

        .reset-btn {
          padding: 10px 20px;
          background: rgba(108, 155, 210, 0.1);
          border: 1px solid #6c9bd2;
          border-radius: 8px;
          color: #6c9bd2;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .reset-btn:hover {
          background: rgba(108, 155, 210, 0.2);
        }

        /* Scrollbar Styles */
        .tokens-container::-webkit-scrollbar {
          width: 6px;
        }

        .tokens-container::-webkit-scrollbar-track {
          background: #0c111a;
          border-radius: 3px;
        }

        .tokens-container::-webkit-scrollbar-thumb {
          background: #232a36;
          border-radius: 3px;
        }

        .tokens-container::-webkit-scrollbar-thumb:hover {
          background: #6c9bd2;
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .dropdowns-line {
            gap: 12px;
          }

          .dropdown-group-inline {
            min-width: 140px;
          }
        }

        @media (max-width: 900px) {
          .stats-line {
            gap: 16px;
          }

          .stat-item-inline {
            gap: 4px;
          }

          .stat-label,
          .dropdown-label {
            font-size: 10px;
          }

          .stat-number {
            font-size: 12px;
          }

          .dropdown-group-inline {
            min-width: 130px;
          }

          .dropdown-select {
            font-size: 11px;
            padding: 6px 8px;
          }
        }

        @media (max-width: 768px) {
          .my-tokens-two-column-layout {
            padding: 12px;
            gap: 12px;
          }

          .filters-bar {
            padding: 12px 16px;
            gap: 10px;
          }

          .stats-line {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .dropdowns-line {
            flex-direction: column;
            gap: 10px;
          }

          .dropdown-group-inline {
            min-width: 100%;
          }

          .token-card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .token-title-section {
            flex-direction: column;
            gap: 4px;
          }

          .token-card-actions {
            flex-direction: column;
          }

          .token-detail-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .detail-value {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
};

export default MyTokensPage;

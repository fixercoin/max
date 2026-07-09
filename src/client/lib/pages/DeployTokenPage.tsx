import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { MaxDexClient } from '../maxDexClient';
import { Connection } from '@solana/web3.js';

const DeployTokenPage: React.FC = () => {
  const { wallet, deployedTokens, setDeployedTokens, dexClient, setDexClient } = useAppContext();
  const [tokenName, setTokenName] = useState('MAX TOKEN');
  const [tokenSymbol, setTokenSymbol] = useState('MAX');
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [tokenSupply, setTokenSupply] = useState(100000000);
  const [tokenLogo, setTokenLogo] = useState<string | null>(null);
  const [status, setStatus] = useState('READY SOLANA MAINNET');

  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [selectedNetwork, setSelectedNetwork] = useState<string>('mainnet-beta');
  const [selectedTokenStandard, setSelectedTokenStandard] = useState<string>('spl');
  const [selectedMintAuthority, setSelectedMintAuthority] = useState<string>('wallet');
  const [showSettings, setShowSettings] = useState(false);

  const presets = {
    custom: { name: 'MAX TOKEN', symbol: 'MAX', supply: 100000000, decimals: 6 },
    meme: { name: 'DOGE MAX', symbol: 'DOGEMAX', supply: 1000000000, decimals: 9 },
    utility: { name: 'UTILITY MAX', symbol: 'UMAX', supply: 50000000, decimals: 6 },
    governance: { name: 'GOVERNANCE MAX', symbol: 'GMAX', supply: 10000000, decimals: 6 }
  };

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      const config = presets[preset as keyof typeof presets];
      setTokenName(config.name);
      setTokenSymbol(config.symbol);
      setTokenSupply(config.supply);
      setTokenDecimals(config.decimals);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTokenLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const initializeDex = async () => {
    if (!wallet) {
      alert('CONNECT WALLET FIRST');
      return false;
    }

    setStatus('INITIALIZING DEX...');

    try {
      const connection = new Connection(selectedNetwork === 'devnet' 
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com'
      );
      const client = new MaxDexClient(connection, wallet);
      
      await client.initializeDex();
      setDexClient(client);
      setStatus('DEX INITIALIZED READY TO DEPLOY TOKEN');
      return true;
    } catch (e: any) {
      if (e.message.includes('already in use')) {
        setStatus('DEX ALREADY INITIALIZED READY TO DEPLOY TOKEN');
        return true;
      }
      setStatus(`DEX INIT FAILED ${e.message}`);
      return false;
    }
  };

  const handleDeployToken = async () => {
    if (!wallet) {
      alert('CONNECT WALLET FIRST');
      return;
    }

    setStatus('PREPARING TOKEN DEPLOYMENT...');

    try {
      let client = dexClient;
      if (!client) {
        const connection = new Connection(selectedNetwork === 'devnet' 
          ? 'https://api.devnet.solana.com'
          : 'https://api.mainnet-beta.solana.com'
        );
        client = new MaxDexClient(connection, wallet);
        setDexClient(client);
      }

      setStatus('DEPLOYING TOKEN VIA MAX DEX PROGRAM...');
      const mintAddress = await client.deployToken(tokenName, tokenSymbol, tokenDecimals);
      
      const initialSupply = tokenSupply * Math.pow(10, tokenDecimals);
      setStatus('MINTING INITIAL SUPPLY...');
      await client.mintTokens(mintAddress, initialSupply);

      const metadataAddress = await client.getTokenMetadataAddress(mintAddress);
      const metadata = await client.program.account.tokenMetadata.fetch(metadataAddress) as any;

      const newTokens = [
        ...deployedTokens,
        {
          mint: mintAddress.toString(),
          name: tokenName,
          symbol: tokenSymbol,
          decimals: tokenDecimals,
          totalSupply: tokenSupply,
          circulatingSupply: (metadata.circulatingSupply as any).toString(),
          metadataAddress: metadataAddress.toString(),
          network: selectedNetwork,
          standard: selectedTokenStandard,
          logo: tokenLogo,
        },
      ];
      setDeployedTokens(newTokens);
      localStorage.setItem('MAX_deployed', JSON.stringify(newTokens));

      setStatus(
        `TOKEN DEPLOYED VIA MAX DEX\n` +
        `MINT: ${mintAddress.toString()}\n` +
        `METADATA: ${metadataAddress.toString()}\n` +
        `SUPPLY: ${tokenSupply.toLocaleString()} ${tokenSymbol}\n` +
        `NETWORK: ${selectedNetwork.toUpperCase()}\n` +
        `VIEW TOKEN ON EXPLORER: https://explorer.solana.com/address/${mintAddress.toString()}?cluster=${selectedNetwork}`
      );
      
      setTokenName('MAX TOKEN');
      setTokenSymbol('MAX');
      setTokenDecimals(6);
      setTokenSupply(10000000);
      setTokenLogo(null);
      setSelectedPreset('custom');
      
    } catch (e: any) {
      setStatus(`${e.message}`);
      console.error('DEPLOYMENT ERROR:', e);
    }
  };

  const handleQuickFill = (type: string) => {
    switch(type) {
      case 'small':
        setTokenSupply(10000);
        break;
      case 'medium':
        setTokenSupply(1000000);
        break;
      case 'large':
        setTokenSupply(1000000000);
        break;
    }
  };

  return (
    <div className="deploy-token-full-width">
      <div className="main-card">
        <div className="two-columns-container">
          
          {/* LEFT COLUMN - DEPLOYMENT SETTINGS */}
          <div className="left-column">
            <div className="settings-header">
              <div className="column-header">DEPLOYMENT SETTINGS</div>
              <button
                className="settings-toggle-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="Toggle settings"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12 1v6m0 6v6m4.22-15.22l-4.24 4.24m-4.24 4.24l-4.24 4.24m14.9 2.9l-4.24-4.24m-4.24-4.24l-4.24-4.24"></path>
                  <circle cx="12" cy="12" r="9"></circle>
                </svg>
              </button>
            </div>

            <div className="status-card">
              <div className="status-header">
                <span className="status-title">CONNECTION STATUS</span>
              </div>
              <div className="status-content">
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{status}</pre>
              </div>
            </div>

            {showSettings && (
              <div className="settings-panel">
                <div className="form-group">
                  <label className="form-label">TOKEN PRESET</label>
                  <select
                    className="form-select"
                    value={selectedPreset}
                    onChange={(e) => handlePresetChange(e.target.value)}
                  >
                    <option value="custom">CUSTOM TOKEN</option>
                    <option value="meme">MEME TOKEN</option>
                    <option value="utility">UTILITY TOKEN</option>
                    <option value="governance">GOVERNANCE TOKEN</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">NETWORK</label>
                  <select
                    className="form-select"
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value)}
                  >
                    <option value="devnet">DEVNET TEST</option>
                    <option value="mainnet-beta">MAINNET PRODUCTION</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">TOKEN STANDARD</label>
                  <select
                    className="form-select"
                    value={selectedTokenStandard}
                    onChange={(e) => setSelectedTokenStandard(e.target.value)}
                  >
                    <option value="spl">SPL TOKEN</option>
                    <option value="spl2022">SPL TOKEN 2022</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">MINT AUTHORITY</label>
                  <select
                    className="form-select"
                    value={selectedMintAuthority}
                    onChange={(e) => setSelectedMintAuthority(e.target.value)}
                  >
                    <option value="wallet">CURRENT WALLET</option>
                    <option value="multisig">MULTI-SIG COMING SOON</option>
                    <option value="timelock">TIME-LOCK COMING SOON</option>
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">QUICK SUPPLY OPTIONS</label>
              <div className="supply-buttons">
                <button onClick={() => handleQuickFill('small')} className="supply-btn">10K</button>
                <button onClick={() => handleQuickFill('medium')} className="supply-btn">1M</button>
                <button onClick={() => handleQuickFill('large')} className="supply-btn">1B</button>
              </div>
            </div>

            <div className="info-card">
              <div className="info-text">
                <strong>DEPLOYMENT INFO</strong><br />
                FEE: 0.05 SOL -
                TIME: 30 SECONDS -
                INCLUDES METADATA -
                VERIFIED BY MAX DEX
              </div>
            </div>

            {!dexClient && (
              <button className="action-btn init-btn" onClick={initializeDex}>
                INITIALIZE DEX FIRST
              </button>
            )}

            <button 
              className="action-btn deploy-btn" 
              onClick={handleDeployToken}
              disabled={!dexClient && !status.includes('ALREADY INITIALIZED')}
            >
              DEPLOY TOKEN ON MAX DEX
            </button>

            <div className="warning-text">
            </div>

            {deployedTokens.length > 0 && (
              <div className="recent-card">
                <div className="recent-header">RECENT DEPLOYMENTS</div>
                <div className="recent-list">
                  {deployedTokens.slice(-3).reverse().map((token, idx) => (
                    <div key={idx} className="recent-item">
                      {token.logo ? (
                        <img src={token.logo} alt={token.symbol} className="recent-logo" />
                      ) : (
                        <div className="recent-logo-placeholder">{token.symbol?.substring(0, 2)}</div>
                      )}
                      <div className="recent-details">
                        <div className="recent-name">{token.name}</div>
                        <div className="recent-supply">{token.totalSupply?.toLocaleString()} SUPPLY</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - TOKEN CONFIGURATION */}
          <div className="right-column">
            <div className="column-header">TOKEN CONFIGURATION</div>
            
            <div className="form-group">
              <label className="form-label">TOKEN LOGO</label>
              <div className="logo-container">
                {tokenLogo ? (
                  <div className="logo-preview">
                    <img src={tokenLogo} alt="TOKEN LOGO" className="logo-img" />
                    <button className="remove-logo" onClick={() => setTokenLogo(null)}>REMOVE</button>
                  </div>
                ) : (
                  <div className="logo-upload">
                    <label className="upload-label">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="logo-input" />
                      <div className="upload-placeholder">CLICK TO UPLOAD LOGO</div>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="info-section">
              <div className="info-section-header">TOKEN INFORMATION</div>
              <div className="info-row">
                <span className="info-label">TOKEN NAME</span>
                <span className="info-value">{tokenName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">TOKEN SYMBOL</span>
                <span className="info-value">{tokenSymbol}</span>
              </div>
              <div className="info-row">
                <span className="info-label">DECIMALS</span>
                <span className="info-value">{tokenDecimals}</span>
              </div>
              <div className="info-row">
                <span className="info-label">TOTAL SUPPLY</span>
                <span className="info-value highlight">{tokenSupply.toLocaleString()} {tokenSymbol}</span>
              </div>
              <div className="info-row">
                <span className="info-label">NETWORK</span>
                <span className="info-value">{selectedNetwork.toUpperCase()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">TOKEN STANDARD</span>
                <span className="info-value">{selectedTokenStandard.toUpperCase()}</span>
              </div>
              <div className="info-row">
                <span className="info-label">ESTIMATED COST</span>
                <span className="info-value">0.05 SOL</span>
              </div>
            </div>

            <div className="info-section">
              <div className="info-section-header">TOKEN DETAILS</div>
              <div className="token-details-grid">
                <div className="form-group">
                  <label className="form-label">TOKEN NAME</label>
                  <input
                    type="text"
                    className="form-input"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value.toUpperCase())}
                    placeholder="MAX TOKEN"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">SYMBOL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                    placeholder="MAX"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">DECIMALS</label>
                  <input
                    type="number"
                    className="form-input"
                    value={tokenDecimals}
                    onChange={(e) => setTokenDecimals(parseInt(e.target.value))}
                    min="0"
                    max="9"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">TOTAL SUPPLY</label>
                  <input
                    type="number"
                    className="form-input"
                    value={tokenSupply}
                    onChange={(e) => setTokenSupply(parseInt(e.target.value))}
                    min="1"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .deploy-token-full-width {
          width: 100%;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f1419 0%, #151d28 100%);
          padding: 0;
          margin: 0;
        }

        .main-card {
          width: 100%;
          background: rgba(12, 17, 26, 0.95);
          border-radius: 0;
          border: none;
          min-height: 100vh;
        }

        .two-columns-container {
          display: flex;
          width: 100%;
          gap: 0;
        }

        .left-column,
        .right-column {
          flex: 1;
          padding: 30px;
          background: rgba(12, 17, 26, 0.8);
          overflow-y: auto;
          min-height: 100vh;
        }

        .left-column {
          border-right: 1px solid #232a36;
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .column-header {
          font-size: 20px;
          font-weight: 700;
          color: #6c9bd2;
          padding-bottom: 12px;
          border-bottom: 2px solid #6c9bd2;
          letter-spacing: 1px;
          flex: 1;
        }

        .settings-toggle-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(108, 155, 210, 0.1);
          border: 1px solid #6c9bd2;
          border-radius: 8px;
          color: #6c9bd2;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: 12px;
        }

        .settings-toggle-btn:hover {
          background: rgba(108, 155, 210, 0.2);
          transform: rotate(90deg);
        }

        .settings-toggle-btn svg {
          width: 18px;
          height: 18px;
        }

        .settings-panel {
          background: rgba(108, 155, 210, 0.05);
          border: 1px solid #232a36;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .settings-panel .form-group {
          margin-bottom: 18px;
        }

        .settings-panel .form-group:last-child {
          margin-bottom: 0;
        }

        .status-card {
          background: #0c111a;
          border-radius: 10px;
          border: 1px solid #1e2a3a;
          margin-bottom: 20px;
        }

        .status-header {
          padding: 12px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
        }

        .status-title {
          font-size: 12px;
          font-weight: 700;
          color: #8e9bae;
          letter-spacing: 1px;
        }

        .status-content {
          padding: 12px;
          font-size: 12px;
          color: #e6edf5;
          line-height: 1.5;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #8e9bae;
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .form-input,
        .form-select {
          width: 100%;
          padding: 12px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 8px;
          color: #e6edf5;
          font-size: 13px;
          transition: all 0.2s;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #6c9bd2;
          box-shadow: 0 0 0 2px rgba(108, 155, 210, 0.1);
        }

        .supply-buttons {
          display: flex;
          gap: 10px;
        }

        .supply-btn {
          flex: 1;
          padding: 10px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 6px;
          color: #8e9bae;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .supply-btn:hover {
          border-color: #6c9bd2;
          color: #6c9bd2;
        }

        .info-card {
          background: rgba(108, 155, 210, 0.05);
          border: 1px solid #232a36;
          border-radius: 10px;
          padding: 15px;
          margin-bottom: 20px;
          text-align: center;
        }

        .info-text {
          font-size: 11px;
          color: #8e9bae;
          line-height: 1.8;
        }

        .info-text strong {
          color: #6c9bd2;
          font-size: 12px;
        }

        .action-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 1px;
          margin-bottom: 12px;
        }

        .init-btn {
          background: rgba(108, 155, 210, 0.1);
          border: 1px solid #6c9bd2;
          color: #6c9bd2;
        }

        .init-btn:hover {
          background: rgba(108, 155, 210, 0.2);
        }

        .deploy-btn {
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          color: white;
        }

        .deploy-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(108, 155, 210, 0.3);
        }

        .deploy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .warning-text {
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          color: #f39c12;
          margin-top: 10px;
        }

        .info-section {
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
          margin-bottom: 20px;
          overflow: hidden;
        }

        .info-section-header {
          padding: 14px 20px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
          font-size: 13px;
          font-weight: 700;
          color: #6c9bd2;
          letter-spacing: 1px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 20px;
          border-bottom: 1px solid #1e2a3a;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-label {
          font-size: 12px;
          color: #8e9bae;
          font-weight: 600;
        }

        .info-value {
          font-size: 12px;
          color: #e6edf5;
          font-weight: 500;
        }

        .info-value.highlight {
          color: #6fcf97;
          font-weight: 700;
        }

        /* Token Details Grid - 2 columns, 2 rows */
        .token-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          padding: 20px;
        }

        .token-details-grid .form-group {
          margin-bottom: 0;
        }

        .logo-container {
          margin-top: 5px;
        }

        .logo-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 20px;
          background: #0a0e15;
          border: 1px solid #232a36;
          border-radius: 12px;
        }

        .logo-img {
          width: 100px;
          height: 100px;
          object-fit: cover;
          border-radius: 50%;
          border: 2px solid #6c9bd2;
        }

        .remove-logo {
          padding: 6px 12px;
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid #dc2626;
          border-radius: 6px;
          color: #dc2626;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 1px;
        }

        .remove-logo:hover {
          background: rgba(220, 38, 38, 0.4);
        }

        .logo-upload {
          padding: 30px;
          background: #0a0e15;
          border: 2px dashed #232a36;
          border-radius: 12px;
          text-align: center;
          transition: all 0.2s;
        }

        .logo-upload:hover {
          border-color: #6c9bd2;
        }

        .upload-label {
          cursor: pointer;
          display: block;
        }

        .logo-input {
          display: none;
        }

        .upload-placeholder {
          font-size: 13px;
          font-weight: 600;
          color: #8e9bae;
          letter-spacing: 1px;
          padding: 20px;
        }

        .recent-card {
          background: #0c111a;
          border-radius: 12px;
          border: 1px solid #1e2a3a;
          margin-top: 20px;
          overflow: hidden;
        }

        .recent-header {
          padding: 14px 20px;
          background: linear-gradient(135deg, #0f1419 0%, #0c111a 100%);
          border-bottom: 1px solid #1e2a3a;
          font-size: 13px;
          font-weight: 700;
          color: #6c9bd2;
          text-align: center;
          letter-spacing: 1px;
        }

        .recent-list {
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .recent-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          background: #0a0e15;
          border-radius: 8px;
        }

        .recent-logo {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }

        .recent-logo-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6c9bd2 0%, #4a7aab 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          color: white;
        }

        .recent-details {
          flex: 1;
        }

        .recent-name {
          font-size: 12px;
          font-weight: 600;
          color: #e6edf5;
          margin-bottom: 4px;
        }

        .recent-supply {
          font-size: 10px;
          color: #8e9bae;
        }

        @media (max-width: 1024px) {
          .two-columns-container {
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
            padding: 20px;
          }

          .token-details-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .info-row {
            flex-direction: column;
            gap: 5px;
          }
        }
      `}</style>
    </div>
  );
};

export default DeployTokenPage;

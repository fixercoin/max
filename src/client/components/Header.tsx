import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

declare global {
  interface Window {
    fixorium?: any;
    solana?: any;
    phantom?: any;
  }
}

interface WalletInfo {
  publicKey: string;
  provider: any;
  isConnected: boolean;
}

const Header: React.FC = () => {
  const { wallet, setWallet, currentPage, setCurrentPage } = useAppContext();
  const [walletStatus, setWalletStatus] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string>('phantom');


  // Get wallet provider by name
  const getProvider = (walletName?: string): any => {
    const name = walletName || selectedWallet;
    if (name === 'phantom' || name === 'standard') return window.solana;
    if (name === 'solflare') return window.solana;
    if (name === 'fixorium') return window.fixorium || window.solana;
    return window.solana;
  };

  const isWalletInstalled = (): boolean => {
    return !!window.solana || !!window.fixorium;
  };

  // Check if wallet is already connected on page load
  useEffect(() => {
    const checkWalletConnection = async () => {
      const provider = getProvider();
      if (provider && (provider.isConnected || provider.publicKey)) {
        try {
          let publicKey = '';
          if (provider.publicKey) {
            publicKey = typeof provider.publicKey === 'string'
              ? provider.publicKey
              : provider.publicKey.toString();
          } else if (provider.getAccounts) {
            const accounts = await provider.getAccounts();
            publicKey = accounts?.[0] || '';
          }

          if (publicKey) {
            const walletInfo: WalletInfo = {
              publicKey: publicKey,
              provider: provider,
              isConnected: true
            };
            setWallet(walletInfo);
            setWalletStatus(`${publicKey.slice(0, 28)}...`);
          }
        } catch (error) {
          console.log('Not connected or error checking connection');
        }
      }
    };

    // Check after a short delay for provider to be injected
    setTimeout(checkWalletConnection, 500);
  }, [setWallet, selectedWallet]);

  const handleConnectWallet = async () => {
    if (!isWalletInstalled()) {
      setWalletStatus('No Solana wallet detected! Install Phantom or Solflare.');
      return;
    }

    setIsConnecting(true);
    const walletDisplayName = selectedWallet.charAt(0).toUpperCase() + selectedWallet.slice(1);
    setWalletStatus(`Connecting to ${walletDisplayName}...`);

    try {
      const provider = getProvider(selectedWallet);

      if (!provider) {
        throw new Error(`${walletDisplayName} provider not found`);
      }

      // Connect with timeout
      const result = await Promise.race([
        provider.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout - wallet did not respond')), 30000)
        )
      ]);

      let publicKey = '';
      if (result.publicKey) {
        publicKey = typeof result.publicKey === 'object'
          ? result.publicKey.toBase58?.() || result.publicKey.toString()
          : result.publicKey;
      } else if (result.address) {
        publicKey = result.address;
      } else if (provider.publicKey) {
        publicKey = typeof provider.publicKey === 'object'
          ? provider.publicKey.toBase58?.() || provider.publicKey.toString()
          : provider.publicKey;
      }

      if (!publicKey) {
        throw new Error('No public key received from wallet');
      }

      const walletInfo: WalletInfo = {
        publicKey: publicKey,
        provider: provider,
        isConnected: true
      };

      setWallet(walletInfo);
      setWalletStatus(`${publicKey.slice(0, 28)}...`);

      console.log(`Connected to ${walletDisplayName}:`, publicKey);
    } catch (error: any) {
      console.error('Connection error:', error);

      if (error.message?.includes('rejected') || error.code === 4001) {
        setWalletStatus('Connection rejected by user');
      } else if (error.message?.includes('timeout')) {
        setWalletStatus('Connection timeout - please check wallet and try again');
      } else {
        setWalletStatus(error.message || 'Connection failed');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = () => {
    setWallet(null);
    setWalletStatus('');
    // Optionally call provider.disconnect() if available
    const provider = getProvider();
    if (provider?.disconnect) {
      provider.disconnect();
    }
  };

  // Format address for display
  const formatAddress = (address: string): string => {
    if (!address) return '';
    if (address.length <= 40) return address;
    return `${address.slice(0, 28)}...`;
  };

  return (
    <header className="fixed-header">
      <div className="brand">
        <h1>MAX</h1>
      </div>
      <nav className="nav-menu">
        <button
          className={`nav-btn ${currentPage === 'deploy' ? 'active' : ''}`}
          onClick={() => setCurrentPage('deploy')}
        >
          Deploy
        </button>
        <button
          className={`nav-btn ${currentPage === 'pools' ? 'active' : ''}`}
          onClick={() => setCurrentPage('pools')}
        >
          Pools
        </button>
        <button
          className={`nav-btn ${currentPage === 'swap' ? 'active' : ''}`}
          onClick={() => setCurrentPage('swap')}
        >
          Swap
        </button>
        <button
          className={`nav-btn ${currentPage === 'tokens' ? 'active' : ''}`}
          onClick={() => setCurrentPage('tokens')}
        >
          Tokens
        </button>
      </nav>
      <div className="wallet-section">
        {wallet ? (
          <>
            <div className="wallet-info">
              <span className="wallet-address">
                {formatAddress(wallet.publicKey)}
              </span>
              <button
                className="disconnect-wallet"
                onClick={handleDisconnectWallet}
              >
                DISCONNECT
              </button>
            </div>
            <div className="wallet-status wallet-connected">
              ✓ Wallet Connected
            </div>
          </>
        ) : (
          <>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              disabled={isConnecting}
            >
              <option value="phantom">Phantom</option>
              <option value="solflare">Solflare</option>
              <option value="standard">Standard Wallet</option>
            </select>
            <button
              className="connect-wallet"
              onClick={handleConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
            {walletStatus && (
              <div className={`wallet-status ${walletStatus.includes('failed') || walletStatus.includes('rejected') ? 'wallet-error' : ''}`}>
                {walletStatus}
              </div>
            )}
            {!isWalletInstalled() && !walletStatus && (
              <div className="wallet-status wallet-warning">
                No Solana wallet detected. Install Phantom or Solflare.
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Header;

import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { PageType } from '../../App';
import { fixoriumWallet } from '../lib/fixoriumWalletConnector';

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
  const [showWalletDialog, setShowWalletDialog] = useState(false);


  const getProvider = (walletName?: string): any => {
    const name = walletName || selectedWallet;
    if (name === 'fixorium') return window.fixorium;
    return window.solana;
  };

  const isWalletInstalled = (walletName?: string): boolean => {
    if (walletName === 'fixorium') return true;
    return !!getProvider(walletName);
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

  const handleWalletSelect = (walletName: string) => {
    setSelectedWallet(walletName);
    setShowWalletDialog(false);
    handleConnectWallet(walletName);
  };

  const handleConnectWallet = async (walletName?: string) => {
    const name = walletName || selectedWallet;
    const walletDisplayName = name === 'fixorium'
      ? 'Fixorium'
      : name.charAt(0).toUpperCase() + name.slice(1);

    if (!isWalletInstalled(name)) {
      setWalletStatus(`${walletDisplayName} wallet not detected. Install or open ${walletDisplayName} and try again.`);
      return;
    }

    setIsConnecting(true);
    setWalletStatus(`Connecting to ${walletDisplayName}...`);

    try {
      if (name === 'fixorium') {
        const connection = await fixoriumWallet.connect();
        setWallet({
          publicKey: connection.publicKey,
          provider: fixoriumWallet,
          isConnected: true
        });
        setWalletStatus(`${connection.publicKey.slice(0, 28)}...`);
        return;
      }

      const provider = getProvider(name);

      if (!provider) {
        throw new Error(`${walletDisplayName} provider not found`);
      }

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

  const walletOptions = [
    { name: 'phantom', label: 'Phantom' },
    { name: 'solflare', label: 'Solflare' },
    { name: 'standard', label: 'Standard Wallet' },
    { name: 'fixorium', label: 'Fixorium Wallet' }
  ];

  const handleDisconnectWallet = () => {
    setWallet(null);
    setWalletStatus('');
    // Optionally call provider.disconnect() if available
    if (selectedWallet === 'fixorium') {
      fixoriumWallet.disconnect();
      return;
    }

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

  const navItems = [
    { id: 'deploy', label: 'Deploy Pool', icon: 'deploy' },
    { id: 'pools', label: 'Liquidity', icon: 'pools' },
    { id: 'swap', label: 'Swap Tokens', icon: 'swap' },
    { id: 'tokens', label: 'My Tokens', icon: 'tokens' }
  ];

  const renderNavIcon = (iconType: string) => {
    switch(iconType) {
      case 'deploy':
        return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
      case 'pools':
        return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20M7 7h10M7 17h10"></path></svg>;
      case 'swap':
        return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>;
      case 'tokens':
        return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>;
      default:
        return null;
    }
  };

  return (
    <>
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
            <button
              className="connect-wallet"
              onClick={() => setShowWalletDialog(true)}
              disabled={isConnecting}
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>

            {showWalletDialog && (
              <>
                <div className="wallet-dialog-overlay" onClick={() => setShowWalletDialog(false)}></div>
                <div className="wallet-dialog">
                  <div className="wallet-dialog-header">
                    <h3>Select Wallet</h3>
                    <button
                      className="wallet-dialog-close"
                      onClick={() => setShowWalletDialog(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="wallet-dialog-content">
                    {walletOptions.map((option) => (
                      <button
                        key={option.name}
                        className="wallet-option"
                        onClick={() => handleWalletSelect(option.name)}
                        disabled={isConnecting}
                      >
                        <span className="wallet-option-label">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {walletStatus && (
              <div className={`wallet-status ${walletStatus.includes('failed') || walletStatus.includes('rejected') ? 'wallet-error' : ''}`}>
                {walletStatus}
              </div>
            )}
            {!isWalletInstalled() && !walletStatus && (
              <div className="wallet-status wallet-warning">
                No wallet detected. Install Phantom, Solflare, or Fixorium Wallet.
              </div>
            )}
          </>
        )}
      </div>
      </header>

      <nav className="mobile-bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => setCurrentPage(item.id as PageType)}
          >
            <div className="mobile-nav-icon">{renderNavIcon(item.icon)}</div>
            <div className="mobile-nav-label">{item.label}</div>
          </button>
        ))}
      </nav>
    </>
  );
};

export default Header;

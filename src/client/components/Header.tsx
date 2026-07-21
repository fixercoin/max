import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { PageType } from '../../App';

declare global {
  interface Window {
    fixorium?: any;
    solana?: any;
    phantom?: any;
    walletWindow?: Window | null; // ← Add this
  }
}

interface WalletInfo {
  publicKey: string;
  provider: any;
  isConnected: boolean;
}

// ============================================================
// FIXORIUM WALLET CONNECTOR - Deep Link Integration
// ============================================================

const FIXORIUM_WALLET_URL = 'https://wallet.fixorium.com.pk';

class FixoriumWalletConnector {
  private publicKey: string | null = null;
  private isConnected: boolean = false;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      // Only accept messages from Fixorium Wallet
      if (event.origin !== FIXORIUM_WALLET_URL) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        console.log('📩 Fixorium Wallet message:', data);

        // Handle connection response
        if (data.type === 'CONNECTION_APPROVED') {
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            this.publicKey = data.payload?.publicKey || null;
            this.isConnected = true;
            pending.resolve({ publicKey: this.publicKey });
            this.pendingRequests.delete(data.requestId);
          }
        }

        // Handle connection rejection
        if (data.type === 'CONNECTION_REJECTED') {
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            pending.reject(new Error('Connection rejected by user'));
            this.pendingRequests.delete(data.requestId);
          }
        }

        // Handle transaction signed
        if (data.type === 'TRANSACTION_SIGNED') {
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            pending.resolve({ signature: data.payload?.signature });
            this.pendingRequests.delete(data.requestId);
          }
        }

        // Handle transaction rejected
        if (data.type === 'TRANSACTION_REJECTED') {
          const pending = this.pendingRequests.get(data.requestId);
          if (pending) {
            pending.reject(new Error('Transaction rejected by user'));
            this.pendingRequests.delete(data.requestId);
          }
        }
      } catch (error) {
        console.error('Error processing wallet message:', error);
      }
    });
  }

  // ============================================================
  // CONNECT WALLET
  // ============================================================

  async connect(): Promise<{ publicKey: string }> {
    return new Promise((resolve, reject) => {
      const requestId = 'conn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      // Store promise callbacks
      this.pendingRequests.set(requestId, { resolve, reject });

      // Build deep link URL
      const params = new URLSearchParams();
      params.append('requestId', requestId);
      params.append('message', 'Connect to Max Fixorium App');
      params.append('appName', 'Max Fixorium App');
      params.append('appUrl', window.location.origin);
      params.append('callbackUrl', window.location.origin + '/callback');

      const webUrl = `${FIXORIUM_WALLET_URL}/sign?${params.toString()}`;
      const deepLink = `fixorium://sign?${params.toString()}`;

      console.log('🔗 Opening Fixorium Wallet...');
      console.log('   • Request ID:', requestId);
      console.log('   • Web URL:', webUrl);

      // Open wallet
      this.openWallet(webUrl, deepLink);

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Connection timeout - wallet did not respond'));
        }
      }, 60000);
    });
  }

  // ============================================================
  // SIGN TRANSACTION
  // ============================================================

  async signTransaction(transaction: any): Promise<{ signature: string }> {
    if (!this.isConnected || !this.publicKey) {
      throw new Error('Wallet not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      // Convert transaction to base64
      const transactionBase64 = typeof transaction === 'string' 
        ? transaction 
        : btoa(JSON.stringify(transaction));

      this.pendingRequests.set(requestId, { resolve, reject });

      const params = new URLSearchParams();
      params.append('requestId', requestId);
      params.append('transaction', transactionBase64);
      params.append('message', 'Sign Transaction');
      params.append('appName', 'Max Fixorium App');
      params.append('appUrl', window.location.origin);
      params.append('callbackUrl', window.location.origin + '/callback');

      const webUrl = `${FIXORIUM_WALLET_URL}/sign?${params.toString()}`;
      const deepLink = `fixorium://sign?${params.toString()}`;

      console.log('✍️ Opening Fixorium Wallet for transaction signing...');
      console.log('   • Request ID:', requestId);

      this.openWallet(webUrl, deepLink);

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Transaction signing timeout'));
        }
      }, 60000);
    });
  }

  // ============================================================
  // SIGN MESSAGE
  // ============================================================

  async signMessage(message: string): Promise<{ signature: string }> {
    if (!this.isConnected || !this.publicKey) {
      throw new Error('Wallet not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      this.pendingRequests.set(requestId, { resolve, reject });

      const params = new URLSearchParams();
      params.append('requestId', requestId);
      params.append('message', message);
      params.append('appName', 'Max Fixorium App');
      params.append('appUrl', window.location.origin);
      params.append('callbackUrl', window.location.origin + '/callback');

      const webUrl = `${FIXORIUM_WALLET_URL}/sign?${params.toString()}`;
      const deepLink = `fixorium://sign?${params.toString()}`;

      console.log('✍️ Opening Fixorium Wallet for message signing...');
      console.log('   • Request ID:', requestId);

      this.openWallet(webUrl, deepLink);

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Message signing timeout'));
        }
      }, 60000);
    });
  }

  // ============================================================
  // OPEN WALLET
  // ============================================================

  private openWallet(webUrl: string, deepLink: string) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      console.log('📱 Opening wallet on mobile...');

      // Store request ID for callback handling
      const params = new URLSearchParams(new URL(webUrl).search);
      localStorage.setItem('pending_wallet_request', params.get('requestId') || '');

      // Try deep link first
      if (isAndroid) {
        window.location.href = deepLink;
      } else if (isIOS) {
        window.location.href = deepLink;
      }

      // Fallback: if wallet app not installed, open web version
      setTimeout(() => {
        if (!document.hidden) {
          console.log('⚠️ Wallet app not detected, opening web version...');
          window.location.href = webUrl;
        }
      }, 2000);

    } else {
      // Desktop - open in new window
      console.log('💻 Opening wallet in new window...');
      const walletWindow = window.open(
        webUrl,
        'FixoriumWallet',
        'width=420,height=750,menubar=no,toolbar=no,location=no'
      );

      if (!walletWindow) {
        console.warn('⚠️ Popup blocked, redirecting instead...');
        window.location.href = webUrl;
      }

      // Store reference for communication - FIXED
      window.walletWindow = walletWindow;
    }
  }

  // ============================================================
  // DISCONNECT
  // ============================================================

  disconnect(): void {
    this.publicKey = null;
    this.isConnected = false;
    this.pendingRequests.clear();
    console.log('🔌 Disconnected from Fixorium Wallet');
  }

  // ============================================================
  // GET WALLET INFO
  // ============================================================

  getWalletInfo() {
    return {
      publicKey: this.publicKey,
      isConnected: this.isConnected,
      platform: 'web'
    };
  }
}

// Create singleton instance
const fixoriumWallet = new FixoriumWalletConnector();

// ============================================================
// HEADER COMPONENT
// ============================================================

const Header: React.FC = () => {
  const { wallet, setWallet, currentPage, setCurrentPage } = useAppContext();
  const [walletStatus, setWalletStatus] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string>('fixorium');
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [fixoriumConnection, setFixoriumConnection] = useState<any>(null);

  // Check for callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    const signature = params.get('signature');
    const success = params.get('success') === 'true';
    const error = params.get('error');

    if (requestId && success) {
      console.log('✅ Wallet callback received:', { requestId, signature });
      // Handle connection success
      if (signature) {
        // This is a connection or signature callback
        const walletInfo: WalletInfo = {
          publicKey: signature.split('_')[2] || 'F9RJSJ4Fr2mLsQrZjemeg3PVMjG2KgjF9t5shZLHMnwG',
          provider: fixoriumWallet,
          isConnected: true
        };
        setWallet(walletInfo);
        setWalletStatus(`${walletInfo.publicKey.slice(0, 28)}...`);
        setFixoriumConnection({ publicKey: walletInfo.publicKey });
      }
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (requestId && !success) {
      console.log('❌ Wallet callback rejected:', error);
      setWalletStatus('Connection rejected');
    }

    // Check if Fixorium wallet is already connected
    const stored = localStorage.getItem('fixorium_connection');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.publicKey) {
          const walletInfo: WalletInfo = {
            publicKey: data.publicKey,
            provider: fixoriumWallet,
            isConnected: true
          };
          setWallet(walletInfo);
          setWalletStatus(`${data.publicKey.slice(0, 28)}...`);
          setFixoriumConnection({ publicKey: data.publicKey });
        }
      } catch (e) {
        console.error('Error loading stored connection:', e);
      }
    }
  }, [setWallet]);

  const getProvider = (walletName?: string): any => {
    const name = walletName || selectedWallet;
    if (name === 'fixorium') return fixoriumWallet;
    return window.solana;
  };

  const isWalletInstalled = (walletName?: string): boolean => {
    if (walletName === 'fixorium') return true;
    return !!getProvider(walletName);
  };

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

    setIsConnecting(true);
    setWalletStatus(`Connecting to ${walletDisplayName}...`);

    try {
      if (name === 'fixorium') {
        // Use Fixorium Wallet deep link
        const connection = await fixoriumWallet.connect();
        
        const walletInfo: WalletInfo = {
          publicKey: connection.publicKey,
          provider: fixoriumWallet,
          isConnected: true
        };
        
        setWallet(walletInfo);
        setWalletStatus(`${connection.publicKey.slice(0, 28)}...`);
        setFixoriumConnection({ publicKey: connection.publicKey });
        
        // Store connection
        localStorage.setItem('fixorium_connection', JSON.stringify({
          publicKey: connection.publicKey,
          connectedAt: Date.now()
        }));
        
        console.log('✅ Connected to Fixorium Wallet:', connection.publicKey);
        return;
      }

      // Other wallets (Phantom, Solflare, etc.)
      const provider = getProvider(name);

      if (!provider) {
        throw new Error(`${walletDisplayName} wallet not installed`);
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
    { name: 'fixorium', label: 'Fixorium Wallet' },
    { name: 'phantom', label: 'Phantom' },
    { name: 'solflare', label: 'Solflare' },
    { name: 'standard', label: 'Standard Wallet' }
  ];

  const handleDisconnectWallet = () => {
    if (selectedWallet === 'fixorium') {
      fixoriumWallet.disconnect();
      localStorage.removeItem('fixorium_connection');
    }

    const provider = getProvider();
    if (provider?.disconnect) {
      provider.disconnect();
    }

    setWallet(null);
    setWalletStatus('');
    setFixoriumConnection(null);
    console.log('🔌 Disconnected');
  };

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

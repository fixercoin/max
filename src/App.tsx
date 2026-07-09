import React, { useState, useEffect } from 'react';
import Header from './client/components/Header';
import DeployTokenPage from './client/lib/pages/DeployTokenPage';
import LiquidityPoolsPage from './client/lib/pages/LiquidityPoolsPage';
import SwapRouterPage from './client/lib/pages/SwapRouterPage';
import MyTokensPage from './client/lib/pages/MyTokensPage';
import TokenDetailsPage from './client/lib/pages/TokenDetailsPage';
import { AppContext, AppContextType } from './client/context/AppContext';
import { MaxDexClient } from './client/lib/maxDexClient';

export type PageType = 'deploy' | 'pools' | 'swap' | 'tokens';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('deploy');
  const [wallet, setWallet] = useState<any>(null);
  const [deployedTokens, setDeployedTokens] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [selectedTokenForDetails, setSelectedTokenForDetails] = useState<string | null>(null);
  const [dexClient, setDexClient] = useState<MaxDexClient | null>(null);

  // Load saved data from localStorage
  useEffect(() => {
    const savedTokens = localStorage.getItem('MAX_deployed');
    if (savedTokens) {
      try {
        setDeployedTokens(JSON.parse(savedTokens));
      } catch (e) {
        console.error('Failed to parse saved tokens:', e);
      }
    }
    
    const savedPools = localStorage.getItem('MAX_pools');
    if (savedPools) {
      try {
        setPools(JSON.parse(savedPools));
      } catch (e) {
        console.error('Failed to parse saved pools:', e);
      }
    }
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    if (deployedTokens.length > 0) {
      localStorage.setItem('MAX_deployed', JSON.stringify(deployedTokens));
    }
  }, [deployedTokens]);

  useEffect(() => {
    if (pools.length > 0) {
      localStorage.setItem('MAX_pools', JSON.stringify(pools));
    }
  }, [pools]);

  const contextValue: AppContextType = {
    wallet,
    setWallet,
    deployedTokens,
    setDeployedTokens,
    pools,
    setPools,
    currentPage,
    setCurrentPage,
    selectedTokenForDetails,
    setSelectedTokenForDetails,
    dexClient,
    setDexClient,
  };

  const renderPageLayout = () => {
    switch (currentPage) {
      case 'deploy':
        return (
          <div className="page-layout">
            <div className="page-left">
              <DeployTokenPage />
            </div>
            <div className="page-right">
              <div className="empty-detail">Deploy information will appear here</div>
            </div>
          </div>
        );
      case 'pools':
        return (
          <div className="page-layout">
            <div className="page-left">
              <LiquidityPoolsPage />
            </div>
            <div className="page-right">
              <div className="empty-detail">Pool details will appear here</div>
            </div>
          </div>
        );
      case 'swap':
        return (
          <div className="page-layout">
            <div className="page-left">
              <SwapRouterPage />
            </div>
            <div className="page-right">
              <div className="empty-detail">Swap details will appear here</div>
            </div>
          </div>
        );
      case 'tokens':
        return (
          <div className="page-layout">
            <div className="page-left">
              <MyTokensPage />
            </div>
            <div className="page-right">
              {selectedTokenForDetails ? <TokenDetailsPage /> : <div className="empty-detail">Select a token to view details</div>}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app">
        <Header />
        <main className="main-container">
          {renderPageLayout()}
        </main>
      </div>
    </AppContext.Provider>
  );
};

export default App;

// ============================================================
// CALLBACK PAGE - Detects popup and sends message to parent
// /src/client/lib/pages/Callback.tsx
// ============================================================

import React, { useEffect } from 'react';

const Callback: React.FC = () => {
  useEffect(() => {
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    const signature = params.get('signature');
    const signedTransaction = params.get('signedTransaction');
    const success = params.get('success') === 'true';
    const connected = params.get('connected') === 'true';
    const publicKey = params.get('publicKey');
    const error = params.get('error');

    console.log('📥 Callback received:', {
      requestId,
      signature: signature ? signature.substring(0, 20) + '...' : null,
      signedTransaction: signedTransaction ? signedTransaction.substring(0, 20) + '...' : null,
      success,
      connected,
      publicKey,
      error
    });

    // Check if this is a popup window
    const isPopup = window.opener !== null && window.opener !== window;

    // Determine the actual public key from available data
    let walletPublicKey = publicKey || null;
    
    // If no publicKey but we have a connection signature, extract from it
    if (!walletPublicKey && signature && signature.startsWith('conn_')) {
      // Connection signature format: conn_timestamp_publicKey
      const parts = signature.split('_');
      if (parts.length >= 3) {
        walletPublicKey = parts[2];
      }
    }

    // If still no publicKey, we can't proceed
    if (!walletPublicKey && (success || connected)) {
      console.warn('⚠️ No public key found in callback parameters');
    }

    if (isPopup) {
      console.log('📤 This is a popup window, sending message to parent...');

      // Prepare data to send
      const data = {
        type: (connected || success) ? 'CONNECTION_APPROVED' : 'CONNECTION_REJECTED',
        requestId: requestId,
        payload: {
          publicKey: walletPublicKey || null,
          signature: signature || null,
          signedTransaction: signedTransaction || null,
          connected: connected || success,
          success: success,
          error: error || null
        }
      };

      try {
        // Send message to parent window
        window.opener.postMessage(data, window.location.origin);
        console.log('✅ Message sent to parent window:', {
          type: data.type,
          requestId: data.requestId,
          hasPublicKey: !!data.payload.publicKey
        });
      } catch (e) {
        console.error('❌ Failed to send message to parent:', e);
      }

      // Show message then close popup
      setTimeout(() => {
        console.log('🔒 Closing popup...');
        window.close();
      }, 1500);

    } else {
      // This is the main window (fallback) - store connection and redirect
      console.log('📱 This is the main window, handling callback directly...');

      if (success && walletPublicKey) {
        // Store connection in localStorage
        localStorage.setItem('fixorium_connection', JSON.stringify({
          publicKey: walletPublicKey,
          connectedAt: Date.now(),
          signature: signature || null
        }));
        console.log('✅ Connection stored in localStorage');
      }

      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    }
  }, []);

  // Get params for display
  const params = new URLSearchParams(window.location.search);
  const success = params.get('success') === 'true';
  const publicKey = params.get('publicKey');
  const error = params.get('error');

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
      background: '#f0f4f8'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '40px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        maxWidth: '400px'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {success ? '✅' : '❌'}
        </div>
        <h1 style={{ marginBottom: '8px', textTransform: 'uppercase', fontSize: '20px' }}>
          {success ? 'CONNECTION SUCCESSFUL' : 'CONNECTION FAILED'}
        </h1>
        {success && publicKey && (
          <p style={{ color: '#666', fontSize: '14px', wordBreak: 'break-all' }}>
            Public Key: {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
          </p>
        )}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '14px' }}>
            Error: {error}
          </p>
        )}
        <p style={{ color: '#888', fontSize: '12px', marginTop: '16px' }}>
          {window.opener ? 'Closing popup...' : 'Redirecting...'}
        </p>
        <div style={{
          marginTop: '20px',
          width: '100%',
          height: '4px',
          background: '#e5e5e5',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            background: success ? '#2563eb' : '#dc2626',
            animation: 'progress 1.5s ease-in-out'
          }}></div>
        </div>
        <style>{`
          @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    </div>
  );
};

export default Callback;

// ============================================================
// CALLBACK PAGE - Detects popup and sends message to parent
// /pages/Callback.tsx
// ============================================================

import React, { useEffect } from 'react';

const Callback: React.FC = () => {
  useEffect(() => {
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    const signature = params.get('signature');
    const success = params.get('success') === 'true';
    const connected = params.get('connected') === 'true';
    const publicKey = params.get('publicKey');
    const error = params.get('error');

    console.log('📥 Callback received:', {
      requestId,
      signature,
      success,
      connected,
      publicKey,
      error
    });

    // Check if this is a popup window
    const isPopup = window.opener !== null && window.opener !== window;

    if (isPopup) {
      console.log('📤 This is a popup window, sending message to parent...');

      // Prepare data to send
      const data = {
        type: connected ? 'CONNECTION_APPROVED' : (success ? 'CONNECTION_APPROVED' : 'CONNECTION_REJECTED'),
        requestId: requestId,
        payload: {
          publicKey: publicKey || signature?.split('_')[2] || 'F9RJSJ4Fr2mLsQrZjemeg3PVMjG2KgjF9t5shZLHMnwG',
          connected: connected || success,
          signature: signature,
          success: success,
          error: error
        }
      };

      try {
        // Send message to parent window
        window.opener.postMessage(data, window.location.origin);
        console.log('✅ Message sent to parent window:', data);
      } catch (e) {
        console.error('❌ Failed to send message:', e);
      }

      // Show success message then close popup
      setTimeout(() => {
        console.log('🔒 Closing popup...');
        window.close();
      }, 1000);

    } else {
      // This is the main window - redirect to home
      console.log('📱 This is the main window, redirecting to home...');
      
      // Store connection in localStorage if successful
      if (success && (publicKey || signature)) {
        const walletPublicKey = publicKey || signature?.split('_')[2] || 'F9RJSJ4Fr2mLsQrZjemeg3PVMjG2KgjF9t5shZLHMnwG';
        localStorage.setItem('fixorium_connection', JSON.stringify({
          publicKey: walletPublicKey,
          connectedAt: Date.now()
        }));
      }

      // Redirect to home
      window.location.href = '/';
    }
  }, []);

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
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h1 style={{ marginBottom: '8px', textTransform: 'uppercase', fontSize: '20px' }}>CONNECTION SUCCESSFUL</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>You are now connected to Fixorium Wallet</p>
        <p style={{ color: '#888', fontSize: '12px', marginTop: '16px' }}>Closing popup...</p>
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
            background: '#2563eb',
            animation: 'progress 1s ease-in-out'
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

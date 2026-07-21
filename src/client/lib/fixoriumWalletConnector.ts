interface FixoriumConnectionResponse {
  type: string;
  requestId?: string;
  payload?: {
    publicKey?: string;
    address?: string;
    approved?: boolean;
    error?: string;
  };
  publicKey?: string;
  address?: string;
  error?: string;
}

const getPublicKey = (response: FixoriumConnectionResponse): string => {
  return response.payload?.publicKey || response.payload?.address || response.publicKey || response.address || '';
};

class FixoriumWalletConnector {
  private pendingRequestId: string | null = null;
  private currentPublicKey: string | null = null;

  get publicKey(): string | null {
    return this.currentPublicKey;
  }

  async connect(): Promise<{ publicKey: string }> {
    if (typeof window === 'undefined') {
      throw new Error('Fixorium Wallet is only available in a browser');
    }

    const requestId = `fixorium_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.pendingRequestId = requestId;

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Fixorium Wallet did not respond. Open Fixorium Wallet and try again.'));
      }, 30000);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', handleMessage);
        this.pendingRequestId = null;
      };

      const handleMessage = (event: MessageEvent<FixoriumConnectionResponse>) => {
        if (event.source !== window || !event.data) return;

        const response = event.data;
        if (response.requestId && response.requestId !== requestId) return;
        if (!['WALLET_CONNECTED', 'CONNECTION_RESPONSE', 'CONNECTION_APPROVED', 'CONNECTION_REJECTED'].includes(response.type)) return;

        const publicKey = getPublicKey(response);
        if (response.type === 'CONNECTION_REJECTED' || response.payload?.approved === false || response.error || response.payload?.error) {
          cleanup();
          reject(new Error(response.error || response.payload?.error || 'Connection rejected by user'));
          return;
        }

        if (!publicKey) return;
        cleanup();
        this.currentPublicKey = publicKey;
        resolve({ publicKey });
      };

      window.addEventListener('message', handleMessage);
      window.postMessage({
        type: 'CONNECTION_REQUEST',
        requestId,
        payload: {
          appOrigin: window.location.origin,
          appName: 'MAX DEX',
          platform: 'web'
        },
        timestamp: Date.now()
      }, '*');
    });
  }

  disconnect(): void {
    this.currentPublicKey = null;
    if (typeof window === 'undefined') return;

    window.postMessage({
      type: 'WALLET_DISCONNECTED',
      payload: {},
      timestamp: Date.now()
    }, '*');
  }
}

export const fixoriumWallet = new FixoriumWalletConnector();

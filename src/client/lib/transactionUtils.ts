export interface Transaction {
  id: string;
  hash: string;
  type: 'swap' | 'add-liquidity' | 'remove-liquidity' | 'deploy' | 'mint';
  fromToken?: string;
  toToken?: string;
  amount?: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  explorerUrl?: string;
}

const DEVNET_EXPLORER = 'https://explorer.solana.com/tx';
const TESTNET_EXPLORER = 'https://explorer.solana.com/tx?cluster=testnet';
const MAINNET_EXPLORER = 'https://explorer.solana.com/tx';

export function getExplorerUrl(txHash: string, network: 'devnet' | 'testnet' | 'mainnet' = 'mainnet'): string {
  const baseUrl = network === 'testnet' ? TESTNET_EXPLORER : network === 'mainnet' ? MAINNET_EXPLORER : DEVNET_EXPLORER;
  return `${baseUrl}/${txHash}?cluster=${network === 'mainnet' ? '' : network}`.replace('?cluster=', network === 'mainnet' ? '' : '?cluster=');
}

export function saveTransaction(tx: Transaction): void {
  const stored = localStorage.getItem('MAX_transactions');
  const transactions: Transaction[] = stored ? JSON.parse(stored) : [];
  transactions.unshift(tx);
  localStorage.setItem('MAX_transactions', JSON.stringify(transactions.slice(0, 100)));
}

export function getTransactions(): Transaction[] {
  const stored = localStorage.getItem('MAX_transactions');
  return stored ? JSON.parse(stored) : [];
}

export function getTransactionsByToken(mint: string): Transaction[] {
  const all = getTransactions();
  return all.filter(t => t.fromToken === mint || t.toToken === mint);
}

export function clearTransactions(): void {
  localStorage.removeItem('MAX_transactions');
}

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import idl from '../../idl.json';

export const DEX_PROGRAM_ID = new PublicKey("36qH8uWkekoCa8qzFcBCkmZqUr9Y9JzFgtwct7RsJrTk");

export class MaxDexClient {
  program: Program;
  provider: anchor.AnchorProvider;
  dexState: PublicKey | null = null;
  private lastTx: string = '';
  private connection: Connection;

  constructor(connection: Connection, wallet: any) {
    this.connection = connection;

    const walletForProvider = this.normalizeWallet(wallet);

    if (!walletForProvider.signTransaction) {
      console.warn('Wallet missing signTransaction method - transactions may fail');
    }

    this.provider = new anchor.AnchorProvider(connection, walletForProvider, {
      commitment: 'confirmed'
    });
    anchor.setProvider(this.provider);
    this.program = new Program(idl as any, DEX_PROGRAM_ID, this.provider);
  }

  private normalizeWallet(wallet: any): any {
    if (!wallet) throw new Error('Wallet is required');

    if (wallet.signTransaction && wallet.publicKey) {
      return wallet;
    }

    if (wallet.provider && wallet.provider.signTransaction && wallet.provider.publicKey) {
      return wallet.provider;
    }

    if (typeof wallet.publicKey === 'string') {
      wallet.publicKey = new PublicKey(wallet.publicKey);
    }

    return wallet;
  }

  getConnection(): Connection {
    return this.connection;
  }

  private async confirmTx(txHash: string): Promise<void> {
    try {
      await this.connection.confirmTransaction(txHash, 'confirmed');
    } catch (e) {
      console.warn('Transaction confirmation timeout, but may still succeed:', txHash);
      // Don't throw - transaction may still be processing
    }
  }

  async initializeDex(): Promise<string> {
    const [dexState] = await PublicKey.findProgramAddress(
      [Buffer.from("dex_state")],
      DEX_PROGRAM_ID
    );
    this.dexState = dexState;

    const tx = await this.program.methods
      .initializeDex(this.provider.wallet.publicKey)
      .accounts({
        authority: this.provider.wallet.publicKey,
        dexState: dexState,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Confirm transaction on devnet
    try {
      await this.connection.confirmTransaction(tx, 'confirmed');
    } catch (e) {
      console.warn('Transaction confirmation timeout, but may still succeed:', tx);
    }

    this.lastTx = tx;
    return tx;
  }

  async deployToken(name: string, symbol: string, decimals: number): Promise<PublicKey> {
    if (!this.dexState) {
      const [address] = await PublicKey.findProgramAddress(
        [Buffer.from("dex_state")],
        DEX_PROGRAM_ID
      );
      this.dexState = address;
    }

    const mintKeypair = Keypair.generate();
    const [tokenMetadata] = await PublicKey.findProgramAddress(
      [Buffer.from("token_metadata"), mintKeypair.publicKey.toBuffer()],
      DEX_PROGRAM_ID
    );

    const tx = await this.program.methods
      .deployToken(name, symbol, decimals)
      .accounts({
        authority: this.provider.wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenMetadata: tokenMetadata,
        dexState: this.dexState,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    // Confirm transaction on devnet
    try {
      await this.connection.confirmTransaction(tx, 'confirmed');
    } catch (e) {
      console.warn('Transaction confirmation timeout, but may still succeed:', tx);
    }

    this.lastTx = tx;
    return mintKeypair.publicKey;
  }

  async mintTokens(mint: PublicKey, amount: number): Promise<string> {
    const tokenAccount = await getAssociatedTokenAddress(mint, this.provider.wallet.publicKey);
    const [tokenMetadata] = await PublicKey.findProgramAddress(
      [Buffer.from("token_metadata"), mint.toBuffer()],
      DEX_PROGRAM_ID
    );

    const tx = await this.program.methods
      .mintTokens(new anchor.BN(amount))
      .accounts({
        authority: this.provider.wallet.publicKey,
        mint: mint,
        tokenAccount: tokenAccount,
        tokenMetadata: tokenMetadata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await this.confirmTx(tx);
    this.lastTx = tx;
    return tx;
  }

  async createPool(tokenA: PublicKey, tokenB: PublicKey, feeBps: number): Promise<PublicKey> {
    if (!this.dexState) {
      const [address] = await PublicKey.findProgramAddress(
        [Buffer.from("dex_state")],
        DEX_PROGRAM_ID
      );
      this.dexState = address;
    }

    const [pool] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
      DEX_PROGRAM_ID
    );

    const [poolAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from("pool_authority"), pool.toBuffer()],
      DEX_PROGRAM_ID
    );

    const lpMintKeypair = Keypair.generate();
    const tokenAVaultKeypair = Keypair.generate();
    const tokenBVaultKeypair = Keypair.generate();

    const tx = await this.program.methods
      .createPool(feeBps)
      .accounts({
        authority: this.provider.wallet.publicKey,
        pool: pool,
        tokenA: tokenA,
        tokenB: tokenB,
        tokenAVault: tokenAVaultKeypair.publicKey,
        tokenBVault: tokenBVaultKeypair.publicKey,
        lpMint: lpMintKeypair.publicKey,
        poolAuthority: poolAuthority,
        dexState: this.dexState,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([lpMintKeypair, tokenAVaultKeypair, tokenBVaultKeypair])
      .rpc();

    await this.confirmTx(tx);
    this.lastTx = tx;
    return pool;
  }

  async addLiquidity(
    pool: PublicKey,
    amountA: number,
    amountB: number,
    tokenA: PublicKey,
    tokenB: PublicKey
  ): Promise<string> {
    const poolAccount = await this.program.account.poolAccount.fetch(pool) as any;
    const userTokenA = await getAssociatedTokenAddress(tokenA, this.provider.wallet.publicKey);
    const userTokenB = await getAssociatedTokenAddress(tokenB, this.provider.wallet.publicKey);
    const userLpToken = await getAssociatedTokenAddress(poolAccount.lpMint as PublicKey, this.provider.wallet.publicKey);
    const poolAuthority = this.getPoolAuthorityAddress(pool);

    const tx = await this.program.methods
      .addLiquidity(new anchor.BN(amountA), new anchor.BN(amountB))
      .accounts({
        user: this.provider.wallet.publicKey,
        userTokenA: userTokenA,
        userTokenB: userTokenB,
        userLpToken: userLpToken,
        pool: pool,
        poolTokenAVault: poolAccount.tokenAVault as PublicKey,
        poolTokenBVault: poolAccount.tokenBVault as PublicKey,
        lpMint: poolAccount.lpMint as PublicKey,
        poolAuthority: poolAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    await this.confirmTx(tx);
    this.lastTx = tx;
    return tx;
  }

  async removeLiquidity(pool: PublicKey, lpAmount: number): Promise<string> {
    const poolAccount = await this.program.account.poolAccount.fetch(pool) as any;
    const userTokenA = await getAssociatedTokenAddress(poolAccount.tokenA as PublicKey, this.provider.wallet.publicKey);
    const userTokenB = await getAssociatedTokenAddress(poolAccount.tokenB as PublicKey, this.provider.wallet.publicKey);
    const userLpToken = await getAssociatedTokenAddress(poolAccount.lpMint as PublicKey, this.provider.wallet.publicKey);
    const poolAuthority = this.getPoolAuthorityAddress(pool);

    const tx = await this.program.methods
      .removeLiquidity(new anchor.BN(lpAmount))
      .accounts({
        user: this.provider.wallet.publicKey,
        userTokenA: userTokenA,
        userTokenB: userTokenB,
        userLpToken: userLpToken,
        pool: pool,
        poolTokenAVault: poolAccount.tokenAVault as PublicKey,
        poolTokenBVault: poolAccount.tokenBVault as PublicKey,
        lpMint: poolAccount.lpMint as PublicKey,
        poolAuthority: poolAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    await this.confirmTx(tx);
    this.lastTx = tx;
    return tx;
  }

  async swap(
    pool: PublicKey,
    tokenIn: PublicKey,
    tokenOut: PublicKey,
    amountIn: number,
    minAmountOut: number
  ): Promise<string> {
    const userPublicKey = this.provider.wallet.publicKey;

    if (!this.dexState) {
      const [address] = await PublicKey.findProgramAddress(
        [Buffer.from("dex_state")],
        DEX_PROGRAM_ID
      );
      this.dexState = address;
    }

    const validation = await this.validateSwapPossibility(
      pool,
      tokenIn,
      tokenOut,
      amountIn,
      userPublicKey
    );

    if (!validation.valid) {
      throw new Error(validation.error || 'Swap validation failed');
    }

    const poolAccount = await this.program.account.poolAccount.fetch(pool) as any;

    try {
      const userTokenIn = await this.ensureAssociatedTokenAccount(tokenIn, userPublicKey);
      const userTokenOut = await this.ensureAssociatedTokenAccount(tokenOut, userPublicKey);

      const poolAuthority = this.getPoolAuthorityAddress(pool);

      const tx = await this.program.methods
        .swap(new anchor.BN(amountIn), new anchor.BN(minAmountOut))
        .accounts({
          user: userPublicKey,
          userTokenIn: userTokenIn,
          userTokenOut: userTokenOut,
          pool: pool,
          poolTokenAVault: poolAccount.tokenAVault as PublicKey,
          poolTokenBVault: poolAccount.tokenBVault as PublicKey,
          tokenIn: tokenIn,
          tokenOut: tokenOut,
          poolAuthority: poolAuthority,
          dexState: this.dexState,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .rpc();

      await this.confirmTx(tx);
      this.lastTx = tx;
      return tx;
    } catch (e: any) {
      if (e.message?.includes('insufficient funds')) {
        throw new Error('Insufficient SOL for transaction fees');
      }
      throw e;
    }
  }

  async getDexState(): Promise<any> {
    if (!this.dexState) {
      const [address] = await PublicKey.findProgramAddress(
        [Buffer.from("dex_state")],
        DEX_PROGRAM_ID
      );
      this.dexState = address;
    }
    return this.program.account.dexState.fetch(this.dexState);
  }

  async getPoolAccount(pool: PublicKey): Promise<any> {
    return this.program.account.poolAccount.fetch(pool);
  }

  async getTokenMetadata(mint: PublicKey): Promise<any> {
    const metadataAddress = await this.getTokenMetadataAddress(mint);
    return this.program.account.tokenMetadata.fetch(metadataAddress);
  }

  async getTokenMetadataAddress(mint: PublicKey): Promise<PublicKey> {
    const [address] = await PublicKey.findProgramAddress(
      [Buffer.from("token_metadata"), mint.toBuffer()],
      DEX_PROGRAM_ID
    );
    return address;
  }

  private getPoolAuthorityAddress(pool: PublicKey): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_authority"), pool.toBuffer()],
      DEX_PROGRAM_ID
    );
    return address;
  }

  async getPoolAddress(tokenA: PublicKey, tokenB: PublicKey): Promise<PublicKey> {
    const [address] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
      DEX_PROGRAM_ID
    );
    return address;
  }

  async fetchPoolReserves(pool: PublicKey): Promise<any> {
    try {
      const poolAccount = await this.program.account.poolAccount.fetch(pool);
      return poolAccount;
    } catch (e) {
      console.error("Failed to fetch pool reserves:", e);
      return null;
    }
  }

  async fetchAllPoolsByTokens(tokenMints: PublicKey[]): Promise<any[]> {
    const pools = [];
    for (let i = 0; i < tokenMints.length; i++) {
      for (let j = i + 1; j < tokenMints.length; j++) {
        try {
          const poolAddress = await this.getPoolAddress(tokenMints[i], tokenMints[j]);
          const poolData: any = await this.program.account.poolAccount.fetch(poolAddress);
          pools.push({
            poolAddress: poolAddress.toString(),
            tokenA: tokenMints[i].toString(),
            tokenB: tokenMints[j].toString(),
            reserveA: poolData.reserveA.toNumber(),
            reserveB: poolData.reserveB.toNumber(),
            totalLp: poolData.lpSupply.toNumber(),
            fee: poolData.feeBps,
          });
        } catch (e) {
          // Pool doesn't exist yet
        }
      }
    }
    return pools;
  }

  getLastTransaction(): string {
    return this.lastTx;
  }

  async getTokenBalance(mint: PublicKey, owner: PublicKey): Promise<number> {
    try {
      const ata = await getAssociatedTokenAddress(mint, owner);
      const accountInfo = await this.connection.getAccountInfo(ata);

      if (!accountInfo) {
        return 0;
      }

      const account = await getAccount(this.connection, ata);
      return Number(account.amount);
    } catch (e) {
      console.error('Failed to fetch token balance:', e);
      return 0;
    }
  }

  async ensureAssociatedTokenAccount(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const accountInfo = await this.connection.getAccountInfo(ata);

    if (accountInfo) {
      return ata;
    }

    const transaction = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        this.provider.wallet.publicKey,
        ata,
        owner,
        mint
      )
    );

    await this.provider.sendAndConfirm(transaction);
    return ata;
  }

  async validateSwapPossibility(
    pool: PublicKey,
    tokenIn: PublicKey,
    tokenOut: PublicKey,
    amountIn: number,
    userPublicKey: PublicKey
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const poolAccount = await this.program.account.poolAccount.fetch(pool) as any;

      const isAtoB = poolAccount.tokenA.toString() === tokenIn.toString();
      const reserveIn = isAtoB ? poolAccount.reserveA : poolAccount.reserveB;
      const reserveOut = isAtoB ? poolAccount.tokenBVault : poolAccount.tokenAVault;

      if (reserveIn === 0 || reserveOut === 0) {
        return { valid: false, error: 'Pool has no liquidity' };
      }

      const userBalance = await this.getTokenBalance(tokenIn, userPublicKey);
      if (userBalance < amountIn) {
        return { valid: false, error: `Insufficient balance. Have: ${userBalance}, Need: ${amountIn}` };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: e.message || 'Failed to validate swap' };
    }
  }
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo, Burn, Transfer, InitializeMint};

declare_id!("36qH8uWkekoCa8qzFcBCkmZqUr9Y9JzFgtwct7RsJrTk");

const FIXED_SUPPLY: u64 = 1_000_000_000;
const AUTO_BURN_DAYS: i64 = 730;

#[program]
pub mod max {
    use super::*;

    pub fn initialize_dex(ctx: Context<InitializeDex>, dex_authority: Pubkey) -> Result<()> {
        let dex_state = &mut ctx.accounts.dex_state;
        dex_state.authority = dex_authority;
        dex_state.token_count = 0;
        dex_state.pool_count = 0;
        dex_state.total_volume = 0;
        dex_state.creation_timestamp = Clock::get()?.unix_timestamp;
        dex_state.bump = ctx.bumps.dex_state;
        
        msg!("MAX DEX initialized");
        Ok(())
    }

    pub fn deploy_token(
        ctx: Context<DeployToken>,
        name: String,
        symbol: String,
        decimals: u8,
    ) -> Result<()> {
        require!(decimals <= 9, DexError::InvalidDecimals);
        require!(!name.is_empty() && !symbol.is_empty(), DexError::InvalidTokenName);
        
        let cpi_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );
        token::initialize_mint(cpi_context, decimals, &ctx.accounts.authority.key(), Some(&ctx.accounts.authority.key()))?;
        
        let token_metadata = &mut ctx.accounts.token_metadata;
        token_metadata.mint = ctx.accounts.mint.key();
        token_metadata.name = name;
        token_metadata.symbol = symbol;
        token_metadata.decimals = decimals;
        token_metadata.total_supply = FIXED_SUPPLY;
        token_metadata.circulating_supply = 0;
        token_metadata.creator = ctx.accounts.authority.key();
        token_metadata.creation_timestamp = Clock::get()?.unix_timestamp;
        token_metadata.is_verified = false;
        token_metadata.bump = ctx.bumps.token_metadata;

        let dex_state = &mut ctx.accounts.dex_state;
        dex_state.token_count = dex_state.token_count.saturating_add(1);

        Ok(())
    }

    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, DexError::InvalidAmount);
        
        let token_metadata = &mut ctx.accounts.token_metadata;
        let new_supply = token_metadata.circulating_supply
            .checked_add(amount)
            .ok_or(DexError::MathOverflow)?;
        require!(new_supply <= FIXED_SUPPLY, DexError::ExceedsMaxSupply);

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        token_metadata.circulating_supply = new_supply;
        
        Ok(())
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= 10000, DexError::InvalidFee);
        require!(ctx.accounts.token_a.key() != ctx.accounts.token_b.key(), DexError::IdenticalTokens);
        
        let pool = &mut ctx.accounts.pool;
        pool.token_a = ctx.accounts.token_a.key();
        pool.token_b = ctx.accounts.token_b.key();
        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();
        pool.fee_bps = fee_bps;
        pool.total_liquidity = 0;
        pool.reserve_a = 0;
        pool.reserve_b = 0;
        pool.creation_timestamp = Clock::get()?.unix_timestamp;
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.lp_supply = 0;
        pool.creator = ctx.accounts.authority.key();
        pool.bump = ctx.bumps.pool;
        pool.authority_bump = ctx.bumps.pool_authority;

        let dex_state = &mut ctx.accounts.dex_state;
        dex_state.pool_count = dex_state.pool_count.saturating_add(1);

        let pool_authority_seeds = &[b"pool_authority", ctx.accounts.pool.key().as_ref(), &[ctx.bumps.pool_authority]];
        
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.lp_mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &[pool_authority_seeds],
        );
        token::initialize_mint(cpi_context, 9, &ctx.accounts.pool_authority.key(), Some(&ctx.accounts.pool_authority.key()))?;

        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        require!(amount_a > 0 && amount_b > 0, DexError::InvalidAmount);
        
        let pool = &mut ctx.accounts.pool;

        let lp_to_mint = if pool.total_liquidity == 0 {
            let product = (amount_a as u128).checked_mul(amount_b as u128).ok_or(DexError::MathOverflow)?;
            integer_sqrt(product) as u64
        } else {
            let ratio_a = (amount_a as u128)
                .checked_mul(pool.total_liquidity as u128)
                .ok_or(DexError::MathOverflow)?
                .checked_div(pool.reserve_a as u128)
                .ok_or(DexError::MathOverflow)? as u64;

            let ratio_b = (amount_b as u128)
                .checked_mul(pool.total_liquidity as u128)
                .ok_or(DexError::MathOverflow)?
                .checked_div(pool.reserve_b as u128)
                .ok_or(DexError::MathOverflow)? as u64;

            ratio_a.min(ratio_b)
        };

        require!(lp_to_mint > 0, DexError::InvalidAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_a.to_account_info(),
                    to: ctx.accounts.pool_token_a_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_b.to_account_info(),
                    to: ctx.accounts.pool_token_b_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_b,
        )?;

        let pool_authority_bump = pool.authority_bump;
        let pool_key = ctx.accounts.pool.key();
        let pool_authority_seeds = &[b"pool_authority", pool_key.as_ref(), &[pool_authority_bump]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp_token.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                &[pool_authority_seeds],
            ),
            lp_to_mint,
        )?;

        pool.total_liquidity = pool.total_liquidity.checked_add(lp_to_mint).ok_or(DexError::MathOverflow)?;
        pool.reserve_a = pool.reserve_a.checked_add(amount_a).ok_or(DexError::MathOverflow)?;
        pool.reserve_b = pool.reserve_b.checked_add(amount_b).ok_or(DexError::MathOverflow)?;
        pool.lp_supply = pool.lp_supply.checked_add(lp_to_mint).ok_or(DexError::MathOverflow)?;

        msg!("Added liquidity: {} LP tokens minted", lp_to_mint);
        Ok(())
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_amount: u64,
    ) -> Result<()> {
        require!(lp_amount > 0, DexError::InvalidAmount);
        
        let pool = &mut ctx.accounts.pool;
        require!(pool.total_liquidity >= lp_amount, DexError::InsufficientLiquidity);

        let amount_a = (lp_amount as u128)
            .checked_mul(pool.reserve_a as u128)
            .ok_or(DexError::MathOverflow)?
            .checked_div(pool.total_liquidity as u128)
            .ok_or(DexError::MathOverflow)? as u64;

        let amount_b = (lp_amount as u128)
            .checked_mul(pool.reserve_b as u128)
            .ok_or(DexError::MathOverflow)?
            .checked_div(pool.total_liquidity as u128)
            .ok_or(DexError::MathOverflow)? as u64;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.user_lp_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            lp_amount,
        )?;

        let pool_authority_bump = pool.authority_bump;
        let pool_key = ctx.accounts.pool.key();
        let pool_authority_seeds = &[b"pool_authority", pool_key.as_ref(), &[pool_authority_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_token_a_vault.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                &[pool_authority_seeds],
            ),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_token_b_vault.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                &[pool_authority_seeds],
            ),
            amount_b,
        )?;

        pool.total_liquidity = pool.total_liquidity.checked_sub(lp_amount).ok_or(DexError::MathOverflow)?;
        pool.reserve_a = pool.reserve_a.checked_sub(amount_a).ok_or(DexError::MathOverflow)?;
        pool.reserve_b = pool.reserve_b.checked_sub(amount_b).ok_or(DexError::MathOverflow)?;
        pool.lp_supply = pool.lp_supply.checked_sub(lp_amount).ok_or(DexError::MathOverflow)?;

        msg!("Removed liquidity: {} LP tokens burned", lp_amount);
        Ok(())
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
    ) -> Result<()> {
        require!(amount_in > 0, DexError::InvalidAmount);

        let pool = &mut ctx.accounts.pool;
        require!(pool.reserve_a > 0 && pool.reserve_b > 0, DexError::InsufficientLiquidity);

        let fee_amount = (amount_in as u128)
            .checked_mul(pool.fee_bps as u128)
            .ok_or(DexError::MathOverflow)?
            .checked_div(10000)
            .ok_or(DexError::MathOverflow)? as u64;

        let amount_in_after_fee = amount_in.checked_sub(fee_amount).ok_or(DexError::MathOverflow)?;

        let (amount_out, reserve_in_update, reserve_out_update) = 
            if ctx.accounts.token_in.key() == pool.token_a {
                require!(ctx.accounts.token_out.key() == pool.token_b, DexError::InvalidTokenPair);
                
                let numerator = (amount_in_after_fee as u128).checked_mul(pool.reserve_b as u128).ok_or(DexError::MathOverflow)?;
                let denominator = pool.reserve_a as u128 + amount_in_after_fee as u128;
                let amount_out = numerator.checked_div(denominator).ok_or(DexError::MathOverflow)? as u64;
                
                require!(amount_out >= min_amount_out, DexError::SlippageExceeded);
                require!(amount_out <= pool.reserve_b, DexError::InsufficientLiquidity);
                
                (amount_out, 
                 pool.reserve_a.checked_add(amount_in).ok_or(DexError::MathOverflow)?,
                 pool.reserve_b.checked_sub(amount_out).ok_or(DexError::MathOverflow)?)
            } 
            else if ctx.accounts.token_in.key() == pool.token_b {
                require!(ctx.accounts.token_out.key() == pool.token_a, DexError::InvalidTokenPair);
                
                let numerator = (amount_in_after_fee as u128).checked_mul(pool.reserve_a as u128).ok_or(DexError::MathOverflow)?;
                let denominator = pool.reserve_b as u128 + amount_in_after_fee as u128;
                let amount_out = numerator.checked_div(denominator).ok_or(DexError::MathOverflow)? as u64;
                
                require!(amount_out >= min_amount_out, DexError::SlippageExceeded);
                require!(amount_out <= pool.reserve_a, DexError::InsufficientLiquidity);
                
                (amount_out,
                 pool.reserve_b.checked_add(amount_in).ok_or(DexError::MathOverflow)?,
                 pool.reserve_a.checked_sub(amount_out).ok_or(DexError::MathOverflow)?)
            }
            else {
                return Err(DexError::InvalidTokenPair.into());
            };

        let (from_vault, to_vault) = if ctx.accounts.token_in.key() == pool.token_a {
            (ctx.accounts.pool_token_a_vault.to_account_info(), ctx.accounts.pool_token_b_vault.to_account_info())
        } else {
            (ctx.accounts.pool_token_b_vault.to_account_info(), ctx.accounts.pool_token_a_vault.to_account_info())
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_in.to_account_info(),
                    to: from_vault,
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;

        let pool_authority_bump = pool.authority_bump;
        let pool_key = ctx.accounts.pool.key();
        let pool_authority_seeds = &[b"pool_authority", pool_key.as_ref(), &[pool_authority_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: to_vault,
                    to: ctx.accounts.user_token_out.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                &[pool_authority_seeds],
            ),
            amount_out,
        )?;

        if ctx.accounts.token_in.key() == pool.token_a {
            pool.reserve_a = reserve_in_update;
            pool.reserve_b = reserve_out_update;
        } else {
            pool.reserve_b = reserve_in_update;
            pool.reserve_a = reserve_out_update;
        }

        pool.total_volume = pool.total_volume.checked_add(amount_in as u128).ok_or(DexError::MathOverflow)?;
        pool.total_fees_collected = pool.total_fees_collected.checked_add(fee_amount as u128).ok_or(DexError::MathOverflow)?;
        
        let dex_state = &mut ctx.accounts.dex_state;
        dex_state.total_volume = dex_state.total_volume.checked_add(amount_in as u128).ok_or(DexError::MathOverflow)?;

        msg!("Swap: {} in -> {} out, fee: {}", amount_in, amount_out, fee_amount);
        Ok(())
    }

    pub fn verify_token(ctx: Context<VerifyToken>) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.dex_state.authority, DexError::Unauthorized);
        ctx.accounts.token_metadata.is_verified = true;
        msg!("Token verified");
        Ok(())
    }

    pub fn claim_pool_fees(
        ctx: Context<ClaimPoolFees>,
        token_index: u8,
    ) -> Result<()> {
        require!(ctx.accounts.pool_creator.key() == ctx.accounts.pool.creator, DexError::Unauthorized);

        let pool = &mut ctx.accounts.pool;
        require!(pool.total_fees_collected > 0, DexError::InvalidAmount);

        let fee_amount = pool.total_fees_collected as u64;
        let (from_vault, token_account) = if token_index == 0 {
            require!(ctx.accounts.pool_token_a_vault.mint.key() == ctx.accounts.fee_token_account.mint.key(), DexError::InvalidTokenPair);
            (ctx.accounts.pool_token_a_vault.to_account_info(), ctx.accounts.fee_token_account.to_account_info())
        } else {
            require!(ctx.accounts.pool_token_b_vault.mint.key() == ctx.accounts.fee_token_account.mint.key(), DexError::InvalidTokenPair);
            (ctx.accounts.pool_token_b_vault.to_account_info(), ctx.accounts.fee_token_account.to_account_info())
        };

        let pool_key = ctx.accounts.pool.key();
        let pool_authority_seeds = &[b"pool_authority", pool_key.as_ref(), &[pool.authority_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: from_vault,
                    to: token_account,
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                &[pool_authority_seeds],
            ),
            fee_amount,
        )?;

        pool.total_fees_collected = 0;
        msg!("Pool fees claimed: {}", fee_amount);
        Ok(())
    }
}

fn integer_sqrt(n: u128) -> u128 {
    if n == 0 || n == 1 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[derive(Accounts)]
pub struct InitializeDex<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 16 + 8 + 1,
        seeds = [b"dex_state"],
        bump
    )]
    pub dex_state: Account<'info, DexState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeployToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + 82)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 32 + 1 + 8 + 8 + 32 + 8 + 8 + 1 + 1,
        seeds = [b"token_metadata", mint.key().as_ref()],
        bump
    )]
    pub token_metadata: Account<'info, TokenMetadata>,
    #[account(
        mut,
        seeds = [b"dex_state"],
        bump = dex_state.bump
    )]
    pub dex_state: Account<'info, DexState>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"token_metadata", mint.key().as_ref()],
        bump = token_metadata.bump
    )]
    pub token_metadata: Account<'info, TokenMetadata>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 32 + 2 + 8 + 8 + 8 + 8 + 16 + 16 + 32 + 8 + 1 + 1,
        seeds = [b"pool", token_a.key().as_ref(), token_b.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, PoolAccount>,
    pub token_a: Account<'info, Mint>,
    pub token_b: Account<'info, Mint>,
    #[account(init, payer = authority, token::mint = token_a, token::authority = pool_authority)]
    pub token_a_vault: Account<'info, TokenAccount>,
    #[account(init, payer = authority, token::mint = token_b, token::authority = pool_authority)]
    pub token_b_vault: Account<'info, TokenAccount>,
    #[account(init, payer = authority, space = 8 + 82)]
    pub lp_mint: Account<'info, Mint>,
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"dex_state"],
        bump = dex_state.bump
    )]
    pub dex_state: Account<'info, DexState>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_lp_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool: Account<'info, PoolAccount>,
    #[account(mut)]
    pub pool_token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", pool.key().as_ref()],
        bump = pool.authority_bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_lp_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool: Account<'info, PoolAccount>,
    #[account(mut)]
    pub pool_token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", pool.key().as_ref()],
        bump = pool.authority_bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_out: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool: Account<'info, PoolAccount>,
    #[account(mut)]
    pub pool_token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b_vault: Account<'info, TokenAccount>,
    pub token_in: Account<'info, Mint>,
    pub token_out: Account<'info, Mint>,
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", pool.key().as_ref()],
        bump = pool.authority_bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"dex_state"],
        bump = dex_state.bump
    )]
    pub dex_state: Account<'info, DexState>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPoolFees<'info> {
    #[account(mut)]
    pub pool_creator: Signer<'info>,
    #[account(mut)]
    pub pool: Account<'info, PoolAccount>,
    #[account(mut)]
    pub pool_token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub fee_token_account: Account<'info, TokenAccount>,
    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", pool.key().as_ref()],
        bump = pool.authority_bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VerifyToken<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub token_metadata: Account<'info, TokenMetadata>,
    #[account(
        seeds = [b"dex_state"],
        bump = dex_state.bump
    )]
    pub dex_state: Account<'info, DexState>,
}

#[account]
pub struct DexState {
    pub authority: Pubkey,
    pub token_count: u64,
    pub pool_count: u64,
    pub total_volume: u128,
    pub creation_timestamp: i64,
    pub bump: u8,
}

#[account]
pub struct TokenMetadata {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u64,
    pub circulating_supply: u64,
    pub creator: Pubkey,
    pub creation_timestamp: i64,
    pub is_verified: bool,
    pub bump: u8,
}

#[account]
pub struct PoolAccount {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub fee_bps: u16,
    pub total_liquidity: u64,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub creation_timestamp: i64,
    pub total_volume: u128,
    pub total_fees_collected: u128,
    pub lp_mint: Pubkey,
    pub lp_supply: u64,
    pub creator: Pubkey,
    pub bump: u8,
    pub authority_bump: u8,
}

#[error_code]
pub enum DexError {
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Identical tokens not allowed")]
    IdenticalTokens,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Invalid token pair")]
    InvalidTokenPair,
    #[msg("Invalid decimals")]
    InvalidDecimals,
    #[msg("Invalid token name")]
    InvalidTokenName,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Exceeds max supply")]
    ExceedsMaxSupply,
}

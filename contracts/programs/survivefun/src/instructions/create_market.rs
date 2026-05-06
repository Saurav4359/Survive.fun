use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::state::bet::BetSide;
use crate::state::market::{MarketStatus, Outcome};
use crate::CreateMarket;

pub const MIN_BET_USDC: u64 = 1_000_000;
pub const MAX_BET_USDC: u64 = 50_000_000;
pub const PLATFORM_SEED_USDC_PER_SIDE: u64 = 10_000_000;

#[error_code]
pub enum SurviveError {
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Bet below minimum")]
    BetTooSmall,
    #[msg("Bet above maximum")]
    BetTooLarge,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Market is not resolved")]
    MarketNotResolved,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Did not win")]
    DidNotWin,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Winning pool is zero")]
    ZeroWinningPool,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}

#[event]
pub struct BetPlaced {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub side: BetSide,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub outcome: Outcome,
    pub survive_pool: u64,
    pub rug_pool: u64,
    pub timestamp: i64,
}

#[event]
pub struct PayoutClaimed {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

pub fn create_market(ctx: Context<CreateMarket>, token_mint: Pubkey, duration_seconds: u64) -> Result<()> {
    require!(
        duration_seconds == 3600 || duration_seconds == 21_600 || duration_seconds == 86_400,
        SurviveError::InvalidDuration
    );

    let market = &mut ctx.accounts.market;
    market.token_mint = token_mint;
    market.creator = ctx.accounts.creator.key();
    market.survive_pool = 0;
    market.rug_pool = 0;
    market.total_bettors = 0;
    market.duration = duration_seconds;
    market.created_at = Clock::get()?.unix_timestamp;
    market.expires_at = market
        .created_at
        .checked_add(duration_seconds as i64)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    market.status = MarketStatus::Active;
    market.outcome = None;
    market.platform_fee_bps = 200;
    market.bump = ctx.bumps.market;

    let cpi_accounts = Transfer {
        from: ctx.accounts.platform_usdc.to_account_info(),
        to: ctx.accounts.market_escrow.to_account_info(),
        authority: ctx.accounts.platform_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, PLATFORM_SEED_USDC_PER_SIDE)?;

    let cpi_accounts = Transfer {
        from: ctx.accounts.platform_usdc.to_account_info(),
        to: ctx.accounts.market_escrow.to_account_info(),
        authority: ctx.accounts.platform_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, PLATFORM_SEED_USDC_PER_SIDE)?;

    market.survive_pool = market
        .survive_pool
        .checked_add(PLATFORM_SEED_USDC_PER_SIDE)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    market.rug_pool = market
        .rug_pool
        .checked_add(PLATFORM_SEED_USDC_PER_SIDE)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    Ok(())
}

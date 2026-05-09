use anchor_lang::prelude::*;

use crate::state::bet::BetSide;
use crate::state::market::{MarketStatus, Outcome};
/// 0.01 SOL
pub const MIN_BET_LAMPORTS: u64 = 10_000_000;
/// 10 SOL
pub const MAX_BET_LAMPORTS: u64 = 10_000_000_000;
pub const PLATFORM_SEED_LAMPORTS_PER_SIDE: u64 = 10_000_000;

#[error_code]
pub enum SurviveError {
    #[msg("Market already exists for this token mint")]
    MarketAlreadyExists,
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Bet below minimum (0.01 SOL)")]
    BetTooSmall,
    #[msg("Bet above maximum (10 SOL)")]
    BetTooLarge,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Did not win")]
    DidNotWin,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Winning pool is zero")]
    ZeroWinningPool,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Add stake on the same side as your existing bet (cannot switch survive/rug)")]
    BetSideMismatch,
    #[msg("Insufficient lamports to preserve rent on market")]
    InsufficientRent,
    #[msg("Market cannot be closed while it has bets or non-seed pool funds")]
    MarketHasOpenPositions,
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

fn duration_allowed(duration_seconds: u64) -> bool {
    matches!(duration_seconds, 3600 | 21_600 | 86_400)
        || (cfg!(feature = "integration-test") && duration_seconds == 10)
}

pub fn create_market(ctx: Context<crate::CreateMarket>, token_mint: Pubkey, duration_seconds: u64) -> Result<()> {
    require!(
        duration_allowed(duration_seconds),
        SurviveError::InvalidDuration
    );

    let market = &mut ctx.accounts.market;
    if market.created_at != 0 {
        return err!(SurviveError::MarketAlreadyExists);
    }

    let now = Clock::get()?.unix_timestamp;
    let expires_at = now
        .checked_add(duration_seconds as i64)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.platform_authority.key(),
        &market.key(),
        PLATFORM_SEED_LAMPORTS_PER_SIDE,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.platform_authority.to_account_info(),
            market.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.platform_authority.key(),
        &market.key(),
        PLATFORM_SEED_LAMPORTS_PER_SIDE,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.platform_authority.to_account_info(),
            market.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    market.token_mint = token_mint;
    market.creator = ctx.accounts.creator.key();
    market.survive_pool = PLATFORM_SEED_LAMPORTS_PER_SIDE;
    market.rug_pool = PLATFORM_SEED_LAMPORTS_PER_SIDE;
    market.total_bettors = 0;
    market.duration = duration_seconds;
    market.created_at = now;
    market.expires_at = expires_at;
    market.status = MarketStatus::Active;
    market.outcome = None;
    market.platform_fee_bps = 200;
    market.platform_authority = ctx.accounts.platform_authority.key();
    market.bump = ctx.bumps.market;

    Ok(())
}

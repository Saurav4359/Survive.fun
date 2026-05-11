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
    #[msg("Market already exists for this token mint and market id")]
    MarketAlreadyExists,
    #[msg("Invalid market id")]
    InvalidMarketId,
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

pub fn create_market(
    ctx: Context<crate::CreateMarket>,
    token_mint: Pubkey,
    market_id: Pubkey,
    duration_seconds: u64,
    dev_wallet: Pubkey,
    dev_balance_at_open: u64,
    open_price: u64,
    open_liquidity: u64,
) -> Result<()> {
    require!(market_id != Pubkey::default(), SurviveError::InvalidMarketId);
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

    // Initial survive/rug pool liquidity: paid by the market maker (`creator`), not the platform.
    // `platform_authority` remains a co-signer so only the configured resolver key is recorded.
    let creator_ai = ctx.accounts.creator.to_account_info();
    let market_ai = market.to_account_info();
    let system_ai = ctx.accounts.system_program.to_account_info();

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.creator.key(),
        &market.key(),
        PLATFORM_SEED_LAMPORTS_PER_SIDE,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[creator_ai.clone(), market_ai.clone(), system_ai.clone()],
    )?;

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.creator.key(),
        &market.key(),
        PLATFORM_SEED_LAMPORTS_PER_SIDE,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[creator_ai, market_ai, system_ai],
    )?;

    market.token_mint = token_mint;
    market.market_id = market_id;
    market.dev_wallet = dev_wallet;
    market.dev_balance_at_open = dev_balance_at_open;
    market.open_price = open_price;
    market.open_liquidity = open_liquidity;
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

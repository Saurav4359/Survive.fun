use anchor_lang::prelude::*;

use crate::instructions::create_market::{SurviveError, PLATFORM_SEED_LAMPORTS_PER_SIDE};
use crate::state::market::MarketStatus;

pub fn close_market(ctx: Context<crate::CloseMarket>) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(
        market.status == MarketStatus::Active,
        SurviveError::MarketNotActive
    );
    require!(market.total_bettors == 0, SurviveError::MarketHasOpenPositions);
    require!(
        market.survive_pool == PLATFORM_SEED_LAMPORTS_PER_SIDE
            && market.rug_pool == PLATFORM_SEED_LAMPORTS_PER_SIDE,
        SurviveError::MarketHasOpenPositions
    );
    require!(market.created_at != 0, SurviveError::Unauthorized);
    Ok(())
}

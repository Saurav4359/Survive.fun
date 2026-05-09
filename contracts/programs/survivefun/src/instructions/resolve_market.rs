use anchor_lang::prelude::*;

use crate::instructions::create_market::{MarketResolved, SurviveError};
use crate::state::market::{MarketStatus, Outcome};
use crate::ResolveMarket;

pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: Outcome) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Active, SurviveError::MarketNotActive);

    market.status = MarketStatus::Resolved;
    market.outcome = Some(outcome);

    emit!(MarketResolved {
        market: market.key(),
        outcome,
        survive_pool: market.survive_pool,
        rug_pool: market.rug_pool,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

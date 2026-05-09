use anchor_lang::prelude::*;

use crate::instructions::create_market::{PayoutClaimed, SurviveError};
use crate::state::bet::BetSide;
use crate::state::market::{MarketStatus, Outcome};

pub fn claim_payout(ctx: Context<crate::ClaimPayout>) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let platform_fee_bps = ctx.accounts.market.platform_fee_bps;
    let status = ctx.accounts.market.status;
    let survive_pool = ctx.accounts.market.survive_pool;
    let rug_pool = ctx.accounts.market.rug_pool;
    let outcome_opt = ctx.accounts.market.outcome;

    require!(status == MarketStatus::Resolved, SurviveError::Unauthorized);
    require!(!ctx.accounts.bet.claimed, SurviveError::AlreadyClaimed);
    require!(ctx.accounts.bet.bettor == ctx.accounts.bettor.key(), SurviveError::Unauthorized);
    require!(ctx.accounts.bet.market == market_key, SurviveError::Unauthorized);

    let outcome = outcome_opt.ok_or(SurviveError::Unauthorized)?;

    let won = if ctx.accounts.bet.side == BetSide::Survive {
        outcome == Outcome::Survive
    } else {
        outcome == Outcome::Rug
    };
    require!(won, SurviveError::DidNotWin);

    let winning_pool = if outcome == Outcome::Survive {
        survive_pool
    } else {
        rug_pool
    };
    let losing_pool = if outcome == Outcome::Survive {
        rug_pool
    } else {
        survive_pool
    };

    require!(winning_pool > 0, SurviveError::ZeroWinningPool);

    let platform_fee = losing_pool
        .checked_mul(platform_fee_bps)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let distributable = losing_pool
        .checked_sub(platform_fee)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let bet_amount = ctx.accounts.bet.amount;
    let bet_bettor = ctx.accounts.bet.bettor;

    let your_share = (bet_amount as u128)
        .checked_mul(distributable as u128)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(winning_pool as u128)
        .ok_or(SurviveError::ZeroWinningPool)? as u64;

    let fee_share = (bet_amount as u128)
        .checked_mul(platform_fee as u128)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(winning_pool as u128)
        .ok_or(SurviveError::ZeroWinningPool)? as u64;

    let payout = bet_amount
        .checked_add(your_share)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let market_ai = ctx.accounts.market.to_account_info();
    let bettor_ai = ctx.accounts.bettor.to_account_info();
    let platform_ai = ctx.accounts.platform_authority.to_account_info();

    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(market_ai.data_len());
    let total_out = payout
        .checked_add(fee_share)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    let bal = market_ai.lamports();
    let after = bal
        .checked_sub(total_out)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    require!(after >= min_balance, SurviveError::InsufficientRent);

    **market_ai.try_borrow_mut_lamports()? = bal
        .checked_sub(payout)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    **bettor_ai.try_borrow_mut_lamports()? = bettor_ai
        .lamports()
        .checked_add(payout)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let bal2 = market_ai.lamports();
    **market_ai.try_borrow_mut_lamports()? = bal2
        .checked_sub(fee_share)
        .ok_or(SurviveError::ArithmeticOverflow)?;
    **platform_ai.try_borrow_mut_lamports()? = platform_ai
        .lamports()
        .checked_add(fee_share)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    ctx.accounts.bet.claimed = true;

    emit!(PayoutClaimed {
        market: market_key,
        bettor: bet_bettor,
        amount: payout,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::instructions::create_market::{PayoutClaimed, SurviveError};
use crate::state::bet::BetSide;
use crate::state::market::{MarketStatus, Outcome};
use crate::ClaimPayout;

pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
    let market = &ctx.accounts.market;
    let bet = &mut ctx.accounts.bet;

    require!(market.status == MarketStatus::Resolved, SurviveError::MarketNotResolved);
    require!(!bet.claimed, SurviveError::AlreadyClaimed);
    require!(bet.bettor == ctx.accounts.bettor.key(), SurviveError::Unauthorized);
    require!(bet.market == market.key(), SurviveError::Unauthorized);

    let outcome = market.outcome.ok_or(SurviveError::MarketNotResolved)?;

    let won = match (bet.side, outcome) {
        (BetSide::Survive, Outcome::Survive) => true,
        (BetSide::Rug, Outcome::Rug) => true,
        _ => false,
    };
    require!(won, SurviveError::DidNotWin);

    let winning_pool = match outcome {
        Outcome::Survive => market.survive_pool,
        Outcome::Rug => market.rug_pool,
    };
    let losing_pool = match outcome {
        Outcome::Survive => market.rug_pool,
        Outcome::Rug => market.survive_pool,
    };

    require!(winning_pool > 0, SurviveError::ZeroWinningPool);

    let platform_fee = losing_pool
        .checked_mul(market.platform_fee_bps)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let distributable = losing_pool
        .checked_sub(platform_fee)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let your_share = (bet.amount as u128)
        .checked_mul(distributable as u128)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(winning_pool as u128)
        .ok_or(SurviveError::ZeroWinningPool)? as u64;

    let fee_share = (bet.amount as u128)
        .checked_mul(platform_fee as u128)
        .ok_or(SurviveError::ArithmeticOverflow)?
        .checked_div(winning_pool as u128)
        .ok_or(SurviveError::ZeroWinningPool)? as u64;

    let payout = bet
        .amount
        .checked_add(your_share)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let market_key = market.key();
    let token_mint = market.token_mint;
    let bump = market.bump;
    let seeds: &[&[u8]] = &[b"market", token_mint.as_ref(), &[bump]];
    let signer = &[seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.market_escrow.to_account_info(),
        to: ctx.accounts.bettor_usdc.to_account_info(),
        authority: ctx.accounts.market.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    token::transfer(cpi_ctx, payout)?;

    let cpi_accounts_fee = Transfer {
        from: ctx.accounts.market_escrow.to_account_info(),
        to: ctx.accounts.platform_usdc.to_account_info(),
        authority: ctx.accounts.market.to_account_info(),
    };
    let cpi_ctx_fee = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_fee,
        signer,
    );
    token::transfer(cpi_ctx_fee, fee_share)?;

    bet.claimed = true;

    emit!(PayoutClaimed {
        market: market_key,
        bettor: bet.bettor,
        amount: payout,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

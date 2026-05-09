use anchor_lang::prelude::*;

use crate::instructions::create_market::{BetPlaced, SurviveError, MAX_BET_LAMPORTS, MIN_BET_LAMPORTS};
use crate::state::bet::BetSide;
use crate::state::market::MarketStatus;

pub fn place_bet(ctx: Context<crate::PlaceBet>, side: BetSide, amount: u64) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let bettor_key = ctx.accounts.bettor.key();

    require!(
        ctx.accounts.market.status == MarketStatus::Active,
        SurviveError::MarketNotActive
    );
    require!(
        Clock::get()?.unix_timestamp < ctx.accounts.market.expires_at,
        SurviveError::MarketExpired
    );
    require!(amount >= MIN_BET_LAMPORTS, SurviveError::BetTooSmall);
    require!(amount <= MAX_BET_LAMPORTS, SurviveError::BetTooLarge);

    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &bettor_key,
        &ctx.accounts.market.key(),
        amount,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            ctx.accounts.bettor.to_account_info(),
            ctx.accounts.market.to_account_info(),
        ],
    )?;

    let market = &mut ctx.accounts.market;
    if side == BetSide::Survive {
        market.survive_pool = market
            .survive_pool
            .checked_add(amount)
            .ok_or(SurviveError::ArithmeticOverflow)?;
    } else {
        market.rug_pool = market
            .rug_pool
            .checked_add(amount)
            .ok_or(SurviveError::ArithmeticOverflow)?;
    }

    let bet = &mut ctx.accounts.bet;
    let is_new = bet.market == Pubkey::default();

    if is_new {
        market.total_bettors = market
            .total_bettors
            .checked_add(1)
            .ok_or(SurviveError::ArithmeticOverflow)?;
        bet.market = market_key;
        bet.bettor = bettor_key;
        bet.side = side;
        bet.amount = amount;
        bet.claimed = false;
        bet.bump = ctx.bumps.bet;
    } else {
        require!(bet.market == market_key, SurviveError::Unauthorized);
        require!(bet.bettor == bettor_key, SurviveError::Unauthorized);
        require!(!bet.claimed, SurviveError::AlreadyClaimed);
        require!(bet.side == side, SurviveError::BetSideMismatch);
        bet.amount = bet
            .amount
            .checked_add(amount)
            .ok_or(SurviveError::ArithmeticOverflow)?;
    }

    emit!(BetPlaced {
        market: market_key,
        bettor: bettor_key,
        side,
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

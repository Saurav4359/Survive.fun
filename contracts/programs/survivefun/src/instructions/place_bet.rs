use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

use crate::instructions::create_market::{BetPlaced, SurviveError, MAX_BET_USDC, MIN_BET_USDC};
use crate::state::bet::BetSide;
use crate::state::market::MarketStatus;
use crate::PlaceBet;

pub fn place_bet(ctx: Context<PlaceBet>, side: BetSide, amount: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Active, SurviveError::MarketNotActive);
    require!(
        Clock::get()?.unix_timestamp < market.expires_at,
        SurviveError::MarketExpired
    );
    require!(amount >= MIN_BET_USDC, SurviveError::BetTooSmall);
    require!(amount <= MAX_BET_USDC, SurviveError::BetTooLarge);

    let cpi_accounts = Transfer {
        from: ctx.accounts.bettor_usdc.to_account_info(),
        to: ctx.accounts.market_escrow.to_account_info(),
        authority: ctx.accounts.bettor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    match side {
        BetSide::Survive => {
            market.survive_pool = market
                .survive_pool
                .checked_add(amount)
                .ok_or(SurviveError::ArithmeticOverflow)?;
        }
        BetSide::Rug => {
            market.rug_pool = market
                .rug_pool
                .checked_add(amount)
                .ok_or(SurviveError::ArithmeticOverflow)?;
        }
    }

    market.total_bettors = market
        .total_bettors
        .checked_add(1)
        .ok_or(SurviveError::ArithmeticOverflow)?;

    let bet = &mut ctx.accounts.bet;
    bet.market = market.key();
    bet.bettor = ctx.accounts.bettor.key();
    bet.side = side;
    bet.amount = amount;
    bet.claimed = false;
    bet.bump = ctx.bumps.bet;

    emit!(BetPlaced {
        market: market.key(),
        bettor: ctx.accounts.bettor.key(),
        side,
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

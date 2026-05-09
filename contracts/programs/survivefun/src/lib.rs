use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

pub use state::bet::BetSide;
pub use state::market::Outcome;

declare_id!("9ZqPpXBid4xzB49HjB7zE6BnTWryMuuZFTULTSJqqTd8");

#[program]
pub mod survivefun {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, token_mint: Pubkey, duration_seconds: u64) -> Result<()> {
        instructions::create_market::create_market(ctx, token_mint, duration_seconds)
    }

    pub fn place_bet(ctx: Context<PlaceBet>, side: BetSide, amount: u64) -> Result<()> {
        instructions::place_bet::place_bet(ctx, side, amount)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: Outcome) -> Result<()> {
        instructions::resolve_market::resolve_market(ctx, outcome)
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        instructions::claim_payout::claim_payout(ctx)
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        instructions::close_market::close_market(ctx)
    }
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, duration_seconds: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub platform_authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + crate::state::market::Market::INIT_SPACE,
        seeds = [b"market", token_mint.as_ref()],
        bump
    )]
    pub market: Account<'info, crate::state::market::Market>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub market: Account<'info, crate::state::market::Market>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + crate::state::bet::Bet::INIT_SPACE,
        seeds = [b"bet", market.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, crate::state::bet::Bet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, crate::state::market::Market>,

    #[account(
        constraint = platform_authority.key() == market.platform_authority @ crate::instructions::create_market::SurviveError::Unauthorized
    )]
    pub platform_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"market", market.token_mint.as_ref()],
        bump = market.bump,
        constraint = authority.key() == market.creator @ crate::instructions::create_market::SurviveError::Unauthorized
    )]
    pub market: Account<'info, crate::state::market::Market>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub market: Account<'info, crate::state::market::Market>,

    #[account(
        mut,
        constraint = bet.market == market.key(),
        constraint = bet.bettor == bettor.key(),
    )]
    pub bet: Account<'info, crate::state::bet::Bet>,

    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        constraint = platform_authority.key() == market.platform_authority @ crate::instructions::create_market::SurviveError::Unauthorized
    )]
    pub platform_authority: UncheckedAccount<'info>,
}

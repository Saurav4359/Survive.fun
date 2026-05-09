use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

pub use state::bet::BetSide;
pub use state::market::Outcome;

declare_id!("3shYxrDG1srw1Wxu2yVnrnEUk53m6tS8HDyVKuoYLVd1");

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
        seeds = [
            b"market",
            token_mint.as_ref(),
            duration_seconds.to_le_bytes().as_ref(),
        ],
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
        init,
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

    pub platform_authority: Signer<'info>,
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

    #[account(mut)]
    pub platform_authority: UncheckedAccount<'info>,
}

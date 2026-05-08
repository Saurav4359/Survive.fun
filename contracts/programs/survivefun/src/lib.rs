use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Mint, Token, TokenAccount};

pub mod instructions;
pub mod state;

pub use state::bet::BetSide;
pub use state::market::Outcome;

declare_id!("HB3uE5XQGq1xNtW9RMSrnBegwifeLzk1xyr75ofRPrtH");

/// Devnet USDC mint pinned by spec.
pub const USDC_MINT: Pubkey = anchor_lang::solana_program::pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[program]
pub mod survivefun {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        token_mint: Pubkey,
        duration_seconds: u64,
    ) -> Result<()> {
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

    pub platform_authority: Signer<'info>,

    #[account(
        mut,
        constraint = platform_usdc.owner == platform_authority.key(),
        constraint = platform_usdc.mint == usdc_mint.key(),
    )]
    pub platform_usdc: Account<'info, TokenAccount>,

    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + crate::state::market::Market::INIT_SPACE,
        seeds = [b"market", token_mint.as_ref()],
        bump
    )]
    pub market: Account<'info, crate::state::market::Market>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = usdc_mint,
        associated_token::authority = market,
    )]
    pub market_escrow: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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

    #[account(
        mut,
        constraint = bettor_usdc.owner == bettor.key(),
        constraint = bettor_usdc.mint == usdc_mint.key(),
    )]
    pub bettor_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = market_escrow.key() == get_associated_token_address(&market.key(), &usdc_mint.key()),
        constraint = market_escrow.owner == market.key(),
        constraint = market_escrow.mint == usdc_mint.key(),
    )]
    pub market_escrow: Account<'info, TokenAccount>,

    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
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

    pub bettor: Signer<'info>,

    #[account(
        mut,
        constraint = bettor_usdc.owner == bettor.key(),
        constraint = bettor_usdc.mint == usdc_mint.key(),
    )]
    pub bettor_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = platform_usdc.owner == platform_authority.key(),
        constraint = platform_usdc.mint == usdc_mint.key(),
    )]
    pub platform_usdc: Account<'info, TokenAccount>,

    /// CHECK: Must equal `platform_usdc.owner`.
    pub platform_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = market_escrow.key() == get_associated_token_address(&market.key(), &usdc_mint.key()),
        constraint = market_escrow.owner == market.key(),
        constraint = market_escrow.mint == usdc_mint.key(),
    )]
    pub market_escrow: Account<'info, TokenAccount>,

    #[account(address = USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

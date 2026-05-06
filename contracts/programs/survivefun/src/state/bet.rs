use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BetSide {
    Survive,
    Rug,
}

/// Per-bettor position for a single market.
/// Rent: allocate `8 + Bet::INIT_SPACE` bytes (8-byte Anchor account discriminator).
#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub side: BetSide,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

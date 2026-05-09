use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Active,
    Resolved,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Survive,
    Rug,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub token_mint: Pubkey,
    pub creator: Pubkey,
    pub survive_pool: u64,
    pub rug_pool: u64,
    pub total_bettors: u32,
    pub duration: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub status: MarketStatus,
    pub outcome: Option<Outcome>,
    pub platform_fee_bps: u64,
    /// Resolver + fee recipient; set once in `create_market` from `platform_authority` signer.
    pub platform_authority: Pubkey,
    pub bump: u8,
}

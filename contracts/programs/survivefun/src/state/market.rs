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
    /// Unique id per round; included in the market PDA seeds so the same mint can open new markets after resolution.
    pub market_id: Pubkey,
    /// Token creator / dev wallet — snapshot address at market open (no retroactive manipulation).
    pub dev_wallet: Pubkey,
    /// Dev wallet native SOL balance at creation (lamports).
    pub dev_balance_at_open: u64,
    /// Price at open (fixed-point: price × 1_000_000).
    pub open_price: u64,
    /// Liquidity at open (fixed-point: liquidity × 100).
    pub open_liquidity: u64,
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

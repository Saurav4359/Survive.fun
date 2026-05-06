import { address } from "@solana/addresses";
import axios from "axios";
import { createHelius } from "helius-sdk";

const DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens";

/**
 * Subset of app `Market` / Prisma `Market` fields used for rug checks.
 * `devOpenTokenBalance` is the dev wallet’s balance of `tokenMint` in smallest units when the market opened (required for the 25% sell rule).
 */
export interface RugDetectorMarket {
  tokenMint: string;
  devWallet: string | null;
  openPrice: string | null;
  openLiquidity: string | null;
  devOpenTokenBalance: string | null;
}

type DexScreenerPair = {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number | string | null };
};

type DexScreenerResponse = {
  pairs?: DexScreenerPair[];
};

function parseDecimalString(value: string | null): number | null {
  if (value === null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickSolanaPair(pairs: DexScreenerPair[] | undefined): DexScreenerPair | null {
  if (!pairs?.length) {
    return null;
  }
  const sol = pairs.find((p) => p.chainId === "solana");
  return sol ?? pairs[0] ?? null;
}

async function fetchDexScreenerPair(tokenMint: string): Promise<DexScreenerPair | null> {
  try {
    const { data } = await axios.get<DexScreenerResponse>(`${DEXSCREENER_TOKEN_URL}/${tokenMint}`, {
      timeout: 15_000,
      validateStatus: () => true,
    });
    if (data.pairs === undefined) {
      return null;
    }
    return pickSolanaPair(data.pairs);
  } catch {
    return null;
  }
}

async function checkDevWalletSoldOver25Percent(market: RugDetectorMarket): Promise<boolean> {
  try {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return false;
    }
    if (!market.devWallet || !market.devOpenTokenBalance) {
      return false;
    }

    let baseline: bigint;
    try {
      baseline = BigInt(market.devOpenTokenBalance);
    } catch {
      return false;
    }
    if (baseline <= 0n) {
      return false;
    }

    const helius = createHelius({ apiKey });
    const devAddress = address(market.devWallet);

    const signatures = await helius.getSignaturesForAddress(devAddress, { limit: 25 });

    let totalSold = 0n;

    const amountOf = (o: unknown): bigint => {
      if (!o || typeof o !== "object") {
        return 0n;
      }
      const ui = (o as { uiTokenAmount?: { amount?: unknown } }).uiTokenAmount;
      if (!ui || typeof ui !== "object") {
        return 0n;
      }
      const a = (ui as { amount?: unknown }).amount;
      if (typeof a !== "string") {
        return 0n;
      }
      try {
        return BigInt(a);
      } catch {
        return 0n;
      }
    };

    const sumDevMint = (balances: unknown[]): bigint => {
      let s = 0n;
      for (const b of balances) {
        if (!b || typeof b !== "object") {
          continue;
        }
        const owner = (b as { owner?: unknown }).owner;
        const mint = (b as { mint?: unknown }).mint;
        if (owner !== market.devWallet || mint !== market.tokenMint) {
          continue;
        }
        s += amountOf(b);
      }
      return s;
    };

    for (const row of signatures) {
      if (row.err !== null) {
        continue;
      }

      let tx: unknown;
      try {
        tx = await helius.getTransaction(row.signature, {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        });
      } catch {
        continue;
      }

      if (tx === null || typeof tx !== "object") {
        continue;
      }

      const meta = (tx as { meta?: unknown }).meta;
      if (!meta || typeof meta !== "object") {
        continue;
      }

      const preRaw = (meta as { preTokenBalances?: unknown }).preTokenBalances;
      const postRaw = (meta as { postTokenBalances?: unknown }).postTokenBalances;
      const preList = Array.isArray(preRaw) ? preRaw : [];
      const postList = Array.isArray(postRaw) ? postRaw : [];

      const preTotal = sumDevMint(preList);
      const postTotal = sumDevMint(postList);
      if (postTotal < preTotal) {
        totalSold += preTotal - postTotal;
      }
    }

    return totalSold * 100n > baseline * 25n;
  } catch {
    return false;
  }
}

async function checkPriceDroppedOver90Percent(market: RugDetectorMarket): Promise<boolean> {
  try {
    const open = parseDecimalString(market.openPrice);
    if (open === null || open <= 0) {
      return false;
    }

    const pair = await fetchDexScreenerPair(market.tokenMint);
    if (!pair) {
      return false;
    }

    const currentRaw = pair.priceUsd;
    if (currentRaw === undefined || currentRaw === "") {
      return false;
    }
    const current = Number(currentRaw);
    if (!Number.isFinite(current)) {
      return false;
    }

    const dropPercent = ((open - current) / open) * 100;
    return dropPercent >= 90;
  } catch {
    return false;
  }
}

async function checkLiquidityRemovedOver80Percent(market: RugDetectorMarket): Promise<boolean> {
  try {
    const open = parseDecimalString(market.openLiquidity);
    if (open === null || open <= 0) {
      return false;
    }

    const pair = await fetchDexScreenerPair(market.tokenMint);
    if (!pair) {
      return true;
    }

    const liq = pair.liquidity?.usd;
    if (liq === undefined || liq === null) {
      return true;
    }
    const current = typeof liq === "string" ? Number(liq) : liq;
    if (!Number.isFinite(current)) {
      return true;
    }

    const removedPercent = ((open - current) / open) * 100;
    return removedPercent >= 80;
  } catch {
    return false;
  }
}

/**
 * Returns `true` if any rug condition fires: dev sold >25% of opening balance,
 * price fell ≥90% from open, or liquidity dropped ≥80% from open.
 */
export async function detectRug(market: RugDetectorMarket): Promise<boolean> {
  try {
    const devSell = await checkDevWalletSoldOver25Percent(market);
    const priceDrop = await checkPriceDroppedOver90Percent(market);
    const liquidity = await checkLiquidityRemovedOver80Percent(market);
    return devSell || priceDrop || liquidity;
  } catch {
    return false;
  }
}

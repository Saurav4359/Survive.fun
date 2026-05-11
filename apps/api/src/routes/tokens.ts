import type { ApiResponse, TokenPair } from "@survivefun/types";
import { Router } from "express";
import { z } from "zod";

import {
  birdeyeTokenOverview,
  enrichTokenPairFromBirdeye,
} from "../lib/birdeye";
import {
  fetchDexTokenJson,
  firstPairFromDexBody,
} from "../lib/dexscreener";
import { fetchPumpFunData, pumpFunRecordToTokenPair } from "../lib/pumpfun";
import { cacheGet, cacheSet } from "../lib/redisCache";
import { tokenPairFromHeliusOrPlaceholder } from "../lib/tokenBootstrap";
import { mapDexRecordToTokenPair } from "../lib/tokenPair";
import { parseQuery } from "../lib/zodUtil";

const router = Router();

/** v2: Pump.fun-first cascade (invalidate old `dex:token:` entries). */
const CACHE_PREFIX = "token:pair:v2:";
const CACHE_TTL_SEC = 30;

/** Segment cache by Birdeye availability so adding `BIRDEYE_API_KEY` does not reuse pre-key Redis entries. */
function tokenCacheKey(mint: string): string {
  const birdeye = process.env.BIRDEYE_API_KEY?.trim() ? "y" : "n";
  return `${CACHE_PREFIX}${birdeye}:${mint}`;
}

const mintParamSchema = z.object({
  mint: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid mint address"),
});

router.get("/:mint", async (req, res, next) => {
  try {
    const { mint } = parseQuery(mintParamSchema, req.params);
    const cacheKey = tokenCacheKey(mint);

    const cached = await cacheGet(cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached) as TokenPair;
        const body: ApiResponse<TokenPair> = { success: true, data };
        res.json(body);
        return;
      } catch {
        /* fall through to live fetch */
      }
    }

    let data: TokenPair | null = null;

    try {
      const raw = await fetchPumpFunData(mint);
      data = pumpFunRecordToTokenPair(mint, raw);
    } catch {
      /* DexScreener next */
    }

    if (!data) {
      try {
        const json = await fetchDexTokenJson(mint);
        const pair = firstPairFromDexBody(json);
        if (pair) {
          data = mapDexRecordToTokenPair(pair, mint);
        }
      } catch {
        /* Helius / placeholder */
      }
    }

    if (!data) {
      data = await tokenPairFromHeliusOrPlaceholder(mint);
    }

    let enriched = data;
    const overview = await birdeyeTokenOverview(mint);
    if (overview) {
      enriched = enrichTokenPairFromBirdeye(enriched, overview);
    }
    void cacheSet(cacheKey, JSON.stringify(enriched), CACHE_TTL_SEC);

    const body: ApiResponse<TokenPair> = { success: true, data: enriched };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;

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
import { cacheGet, cacheSet } from "../lib/redisCache";
import { mapDexRecordToTokenPair } from "../lib/tokenPair";
import { parseQuery } from "../lib/zodUtil";
import { AppError } from "../middleware/errorHandler";

const router = Router();

const CACHE_PREFIX = "dex:token:";
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

    const json = await fetchDexTokenJson(mint);
    const pair = firstPairFromDexBody(json);
    if (!pair) {
      throw new AppError("TOKEN_NOT_FOUND", "Token not found on DexScreener", 404);
    }

    let data = mapDexRecordToTokenPair(pair, mint);
    const overview = await birdeyeTokenOverview(mint);
    if (overview) {
      data = enrichTokenPairFromBirdeye(data, overview);
    }
    void cacheSet(cacheKey, JSON.stringify(data), CACHE_TTL_SEC);

    const body: ApiResponse<TokenPair> = { success: true, data };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

export default router;

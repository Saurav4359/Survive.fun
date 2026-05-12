/**
 * Birdeye public API (optional). Set BIRDEYE_API_KEY for holder stats, OHLCV, pump curve hints.
 * @see https://docs.birdeye.so/
 */

import type { OhlcvBar, TokenPair } from "@survivefun/types";
import axios from "axios";

const BASE = "https://public-api.birdeye.so";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function apiKey(): string | null {
  return process.env.BIRDEYE_API_KEY?.trim() || null;
}

function birdeyeHeaders(): Record<string, string> | null {
  const key = apiKey();
  if (!key) return null;
  return {
    "X-API-KEY": key,
    "x-chain": "solana",
  };
}

export async function birdeyeTokenOverview(
  mint: string,
): Promise<Record<string, unknown> | null> {
  const headers = birdeyeHeaders();
  if (!headers) return null;
  try {
    const res = await axios.get<unknown>(`${BASE}/defi/token_overview`, {
      params: { address: mint },
      headers,
      timeout: 15_000,
      validateStatus: (s) => s === 200,
    });
    const body = res.data;
    if (!isRecord(body)) return null;
    if (body.success === false) return null;
    return body;
  } catch {
    return null;
  }
}

/** Merge Birdeye overview into a DexScreener-based TokenPair. */
export function enrichTokenPairFromBirdeye(
  pair: TokenPair,
  overviewBody: Record<string, unknown>,
): TokenPair {
  const data = overviewBody.data;
  if (!isRecord(data)) return pair;

  let holderCount: number | null = null;
  const h = data.holder;
  if (typeof h === "number" && Number.isFinite(h)) holderCount = h;
  else if (isRecord(h) && typeof h.total === "number") holderCount = h.total;

  let birdeyePriceChange24hPercent: number | null = null;
  const pc = data.priceChange24hPercent ?? data.price_change_24h_percent;
  if (typeof pc === "number" && Number.isFinite(pc)) {
    birdeyePriceChange24hPercent = pc;
  } else if (typeof pc === "string") {
    const n = Number.parseFloat(pc);
    if (Number.isFinite(n)) birdeyePriceChange24hPercent = n;
  }

  const h24FromBirdeye = birdeyePriceChange24hPercent;
  const mergedPriceChange = {
    ...pair.priceChange,
    h24:
      pair.priceChange.h24 != null
        ? pair.priceChange.h24
        : h24FromBirdeye != null
          ? h24FromBirdeye
          : null,
  };

  return {
    ...pair,
    priceChange: mergedPriceChange,
    holderCount: holderCount ?? pair.holderCount ?? null,
    birdeyePriceChange24hPercent:
      birdeyePriceChange24hPercent ?? pair.birdeyePriceChange24hPercent ?? null,
  };
}

/**
 * Pump.fun bonding curve stall (spec §1): curve progress ≥ 80% and not graduated.
 * Response shape varies; returns null if Birdeye does not expose pump fields.
 */
export function detectPumpGraduationStall(
  overviewBody: Record<string, unknown>,
): { stall: boolean; detail: Record<string, unknown> } {
  const data = overviewBody.data;
  if (!isRecord(data)) {
    return { stall: false, detail: { skipped: true, reason: "no_data" } };
  }

  const ext = data.extensions;
  const pump = isRecord(ext)
    ? (isRecord(ext.pumpFun)
        ? ext.pumpFun
        : isRecord(ext.pumpfun)
          ? ext.pumpfun
          : null)
    : null;

  if (!isRecord(pump)) {
    return {
      stall: false,
      detail: { skipped: true, reason: "no_pump_extension" },
    };
  }

  const graduated =
    pump.complete === true ||
    pump.completed === true ||
    pump.graduated === true ||
    data.isPumpGraduated === true;

  let curvePercent: number | null = null;
  const cp = pump.curvePercent ?? pump.curve_progress ?? pump.progress;
  if (typeof cp === "number" && Number.isFinite(cp)) curvePercent = cp;

  const detail: Record<string, unknown> = {
    curvePercent,
    graduated,
    pumpKeys: Object.keys(pump),
  };

  if (graduated) {
    return { stall: false, detail: { ...detail, reason: "already_graduated" } };
  }
  if (curvePercent != null && curvePercent >= 80) {
    return {
      stall: true,
      detail: { ...detail, reason: "curve_ge_80_not_graduated" },
    };
  }
  return { stall: false, detail };
}

const OHLCV_TYPES = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "2H",
  "4H",
  "8H",
  "12H",
  "1D",
  "3D",
  "1W",
  "1M",
]);

export async function birdeyeFetchOhlcv(
  mint: string,
  interval: string,
): Promise<OhlcvBar[]> {
  const headers = birdeyeHeaders();
  if (!headers) return [];
  const type = OHLCV_TYPES.has(interval) ? interval : "1H";
  try {
    const res = await axios.get<unknown>(`${BASE}/defi/v3/ohlcv`, {
      params: {
        address: mint,
        type,
        currency: "usd",
        time_to: Math.floor(Date.now() / 1000),
      },
      headers,
      timeout: 20_000,
      validateStatus: (s) => s === 200,
    });
    const body = res.data;
    if (!isRecord(body)) return [];
    const inner = body.data;
    if (!isRecord(inner)) return [];
    const items = inner.items;
    if (!Array.isArray(items)) return [];

    const bars: OhlcvBar[] = [];
    for (const row of items) {
      if (!isRecord(row)) continue;
      const t =
        typeof row.unixTime === "number"
          ? row.unixTime
          : typeof row.time === "number"
            ? row.time
            : null;
      if (t == null) continue;
      const o = row.o ?? row.open;
      const h = row.h ?? row.high;
      const l = row.l ?? row.low;
      const c = row.c ?? row.close;
      const v = row.v ?? row.volume ?? row.vol;
      if (typeof o !== "number" && typeof o !== "string") continue;
      bars.push({
        t,
        o: String(o),
        h: String(h ?? o),
        l: String(l ?? o),
        c: String(c ?? o),
        v: String(v ?? 0),
      });
    }
    return bars;
  } catch {
    return [];
  }
}

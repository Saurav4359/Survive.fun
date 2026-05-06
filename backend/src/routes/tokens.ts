import axios from "axios";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

const DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens";

const mintParamsSchema = z.object({
  mint: z
    .string()
    .min(32)
    .max(44)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
});

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

const router = Router();

router.get("/tokens/:mint", async (req: Request, res: Response) => {
  try {
    const parsed = mintParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid token mint");
      return;
    }

    const { mint } = parsed.data;

    const { data, status } = await axios.get(`${DEXSCREENER_TOKEN_URL}/${mint}`, {
      timeout: 15_000,
      validateStatus: () => true,
    });

    if (status >= 400) {
      sendError(res, 502, "UPSTREAM_ERROR", "DexScreener request failed");
      return;
    }

    sendOk(res, { mint, dexscreener: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    sendError(res, 500, "INTERNAL_ERROR", message);
  }
});

export default router;

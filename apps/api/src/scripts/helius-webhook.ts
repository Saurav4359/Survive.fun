/**
 * Helius webhook management for Survive.fun.
 *
 * Usage (run from apps/api):
 *   pnpm exec tsx src/scripts/helius-webhook.ts list
 *   pnpm exec tsx src/scripts/helius-webhook.ts register
 *   pnpm exec tsx src/scripts/helius-webhook.ts delete <webhookID>
 *   pnpm exec tsx src/scripts/helius-webhook.ts ensure
 *
 * Or from the repo root:
 *   pnpm --filter api helius:list
 *   pnpm --filter api helius:register
 *   pnpm --filter api helius:ensure
 *
 * Required env (loaded from apps/api/.env via `dotenv/config`):
 *   HELIUS_API_KEY              Helius project API key
 *   HELIUS_WEBHOOK_URL          Public HTTPS URL ending in /webhook/helius
 *   HELIUS_WEBHOOK_AUTH_SECRET  Long random string Helius will send as Authorization
 *
 * Watches Pump.fun program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P for
 * TOKEN_MINT and TRANSFER events.
 */

import "dotenv/config";

import { createHelius } from "@helius-labs/helius-sdk";

const PUMP_FUN_PROGRAM_ADDRESS = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

interface HeliusWebhook {
  webhookID: string;
  webhookURL: string;
  accountAddresses?: string[];
  transactionTypes?: string[];
  webhookType?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`✗ Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function getClient() {
  const apiKey = requireEnv("HELIUS_API_KEY");
  return createHelius({ apiKey, network: "mainnet" });
}

async function listWebhooks(): Promise<HeliusWebhook[]> {
  const helius = getClient();
  return (await helius.webhooks.getAll()) as HeliusWebhook[];
}

async function cmdList(): Promise<void> {
  const webhooks = await listWebhooks();
  if (webhooks.length === 0) {
    console.log("No webhooks registered for this Helius project.");
    return;
  }
  for (const w of webhooks) {
    console.log(JSON.stringify(w, null, 2));
  }
}

async function cmdRegister(): Promise<void> {
  const webhookURL = requireEnv("HELIUS_WEBHOOK_URL");
  const authHeader = requireEnv("HELIUS_WEBHOOK_AUTH_SECRET");

  if (!webhookURL.startsWith("https://")) {
    console.error(`✗ HELIUS_WEBHOOK_URL must be HTTPS, got: ${webhookURL}`);
    process.exit(1);
  }
  if (!webhookURL.endsWith("/webhook/helius")) {
    console.warn(
      `⚠ HELIUS_WEBHOOK_URL should end with /webhook/helius (got ${webhookURL}). Continuing.`,
    );
  }

  const helius = getClient();
  const webhook = await helius.webhooks.create({
    webhookURL,
    transactionTypes: ["TOKEN_MINT", "TRANSFER"],
    accountAddresses: [PUMP_FUN_PROGRAM_ADDRESS],
    authHeader,
    webhookType: "enhanced",
  });

  console.log("✅ Helius webhook registered");
  console.log(JSON.stringify(webhook, null, 2));
}

async function cmdDelete(webhookID: string): Promise<void> {
  if (!webhookID) {
    console.error("✗ Usage: helius-webhook.ts delete <webhookID>");
    process.exit(1);
  }
  await getClient().webhooks.delete(webhookID);
  console.log(`✅ Deleted webhook ${webhookID}`);
}

async function cmdEnsure(): Promise<void> {
  const webhookURL = requireEnv("HELIUS_WEBHOOK_URL");
  const existing = await listWebhooks();
  const dupes = existing.filter((w) => w.webhookURL === webhookURL);
  for (const w of dupes) {
    console.log(`Removing duplicate webhook ${w.webhookID} → ${w.webhookURL}`);
    await getClient().webhooks.delete(w.webhookID);
  }
  await cmdRegister();
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "list":
      await cmdList();
      break;
    case "register":
      await cmdRegister();
      break;
    case "delete":
      await cmdDelete(arg ?? "");
      break;
    case "ensure":
      await cmdEnsure();
      break;
    default:
      console.error(
        "Usage: tsx src/scripts/helius-webhook.ts <list|register|delete <id>|ensure>",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("✗ helius-webhook failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env bash
# Survive.fun — build & deploy the Anchor program to Solana devnet, sync program id across the repo, seed demo DB.
#
# Requirements:
#   - solana CLI configured (this script forces cluster to devnet)
#   - anchor CLI (0.29.x recommended to match programs/survivefun/Cargo.toml anchor-lang 0.29.0; otherwise use --no-idl build)
#   - pnpm, Node 20+, DATABASE_URL for setup-demo (see apps/api/.env)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
PROGRAM_SO="${CONTRACTS}/target/deploy/survivefun.so"
PROGRAM_KP="${CONTRACTS}/target/deploy/survivefun-keypair.json"

log() {
  echo "[deploy-contract] $*" >&2
}

die() {
  echo "[deploy-contract] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_cmd solana
require_cmd anchor
require_cmd pnpm
require_cmd python3

log "Solana CLI: $(solana --version 2>&1)"
log "Anchor CLI: $(anchor --version 2>&1)"
log "Setting Solana cluster to devnet"
solana config set --url devnet >/dev/null

ANCHOR_MINOR="$(anchor --version 2>&1 | sed -n 's/.*anchor-cli \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' || true)"
log "Pinned on-chain crate: anchor-lang 0.29.0 (see contracts/programs/survivefun/Cargo.toml)"
if [[ "${ANCHOR_MINOR}" != "0.29" ]]; then
  log "WARNING: anchor-cli is not 0.29.x (parsed minor: '${ANCHOR_MINOR:-unknown}'). Building with --no-idl to avoid IDL/tooling mismatch with anchor-lang 0.29.0."
  (cd "${CONTRACTS}" && anchor build --no-idl)
else
  (cd "${CONTRACTS}" && anchor build)
fi

[[ -f "${PROGRAM_SO}" ]] || die "build did not produce ${PROGRAM_SO}"
[[ -f "${PROGRAM_KP}" ]] || die "missing program keypair ${PROGRAM_KP}"

log "Deploying program to devnet (this spends SOL for rent / upgrade)..."
DEPLOY_OUT="$(solana program deploy "${PROGRAM_SO}" --program-id "${PROGRAM_KP}" 2>&1)" || {
  echo "${DEPLOY_OUT}" >&2
  die "solana program deploy failed"
}
echo "${DEPLOY_OUT}" >&2

PROG_ID="$(echo "${DEPLOY_OUT}" | sed -n 's/^Program Id: //p' | head -1 | tr -d '[:space:]')"
[[ -n "${PROG_ID}" ]] || die "could not parse Program Id from deploy output"

log "Deployed program id: ${PROG_ID}"

log "Syncing program id across repo sources and IDL metadata"
python3 - "${ROOT}" "${PROG_ID}" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
new_id = sys.argv[2]

def write_if_changed(path: Path, new_text: str) -> None:
    old = path.read_text() if path.is_file() else None
    if old != new_text:
        path.write_text(new_text)
        print(f"updated {path.relative_to(root)}")

lib_rs = root / "contracts/programs/survivefun/src/lib.rs"
t = lib_rs.read_text()
t2, n = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{new_id}");', t, count=1)
if n != 1:
    sys.exit(f"expected to patch declare_id once in {lib_rs}, got {n}")
write_if_changed(lib_rs, t2)

anchor_toml = root / "contracts/Anchor.toml"
t = anchor_toml.read_text()
t2, n = re.subn(r'^(survivefun = )"[^"]+"', rf'\1"{new_id}"', t, flags=re.M)
if n < 1:
    sys.exit(f"expected survivefun entries in {anchor_toml}")
write_if_changed(anchor_toml, t2)

constants = root / "apps/web/src/utils/constants.ts"
t = constants.read_text()
t2, n = re.subn(
    r'(const localAnchorProgramId\s*=\s*\n\s*")([^"]+)(")',
    rf"\g<1>{new_id}\g<3>",
    t,
    count=1,
)
if n != 1:
    sys.exit(f"failed to patch localAnchorProgramId in {constants}")
write_if_changed(constants, t2)

solana_ts = root / "apps/api/src/config/solana.ts"
t = solana_ts.read_text()
t2, n = re.subn(
    r'(const DEFAULT_DEV_PROGRAM_ID = ")([^"]+)(")',
    rf"\g<1>{new_id}\g<3>",
    t,
    count=1,
)
if n != 1:
    sys.exit(f"failed to patch DEFAULT_DEV_PROGRAM_ID in {solana_ts}")
write_if_changed(solana_ts, t2)

for rel in (
    "contracts/target/idl/survivefun.json",
    "contracts/target/types/survivefun.ts",
):
    p = root / rel
    if not p.is_file():
        continue
    t = p.read_text()
    t2, n = re.subn(r'"address": "[^"]+"', f'"address": "{new_id}"', t, count=1)
    if n == 1:
        write_if_changed(p, t2)
PY

upsert_env() {
  local file="$1"
  local key="$2"
  local val="$3"
  python3 - "${key}" "${val}" "${file}" <<'PY'
import pathlib
import re
import sys

key, val, path_s = sys.argv[1], sys.argv[2], sys.argv[3]
path = pathlib.Path(path_s)
line = f"{key}={val}\n"
if path.is_file():
    text = path.read_text()
    pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if pat.search(text):
        text = pat.sub(line.rstrip("\n"), text)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += line
    path.write_text(text)
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(line)
print(f"upsert env {key} in {path}")
PY
}

log "Updating environment files (create if missing)"
upsert_env "${ROOT}/apps/api/.env" "SURVIVEFUN_PROGRAM_ID" "${PROG_ID}"
upsert_env "${ROOT}/apps/web/.env.local" "NEXT_PUBLIC_PROGRAM_ID" "${PROG_ID}"
upsert_env "${ROOT}/.env" "SURVIVEFUN_PROGRAM_ID" "${PROG_ID}"
upsert_env "${ROOT}/.env" "NEXT_PUBLIC_PROGRAM_ID" "${PROG_ID}"

log "Running Prisma + setup-demo (requires DATABASE_URL)"
(cd "${ROOT}" && pnpm exec prisma generate --schema=apps/api/prisma/schema.prisma)
(cd "${ROOT}" && pnpm exec ts-node --project tsconfig.scripts.json scripts/setup-demo.ts)

log "Done. Program id: ${PROG_ID} (printed again on stdout for scripts)"
printf '%s\n' "${PROG_ID}"

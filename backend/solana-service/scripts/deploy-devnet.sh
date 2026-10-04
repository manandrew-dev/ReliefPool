#!/usr/bin/env bash
# Builds and deploys the program to devnet. Needs the program keypair whose address is in
# declare_id! (kept outside the repo) and an upgrade-authority wallet with ~3 devnet SOL.
set -euo pipefail
cd "$(dirname "$0")/.."

program_keypair="${PROGRAM_KEYPAIR:-$HOME/.config/solana/reliefpool-program-keypair.json}"
if [[ ! -f "$program_keypair" ]]; then
  echo "Missing program keypair at $program_keypair (set PROGRAM_KEYPAIR)." >&2
  exit 1
fi
expected="$(grep -o 'declare_id!("[^"]*")' programs/reliefpool/src/lib.rs | cut -d'"' -f2)"
actual="$(solana address -k "$program_keypair")"
if [[ "$expected" != "$actual" ]]; then
  echo "Program keypair is $actual but declare_id! is $expected." >&2
  exit 1
fi

./scripts/build.sh
mkdir -p target/deploy
cp "$program_keypair" target/deploy/reliefpool-keypair.json
anchor deploy --provider.cluster devnet
echo "Deployed program $actual to devnet"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

solana config set --url devnet

if [[ ! -f ~/.config/solana/id.json ]]; then
  solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase --force
fi

solana airdrop 2 || true

mkdir -p target/deploy
if [[ ! -f target/deploy/reliefpool-keypair.json ]]; then
  solana-keygen new --outfile target/deploy/reliefpool-keypair.json --no-bip39-passphrase --force
fi

anchor keys sync
anchor build
anchor deploy --provider.cluster devnet

printf '\nProgram ID: %s\n' "$(solana address -k target/deploy/reliefpool-keypair.json)"

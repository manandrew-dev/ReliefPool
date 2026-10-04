#!/usr/bin/env bash
# Builds the program and exports the IDL and TypeScript types to idl/ at the repo root,
# where the oracle and frontend read them (docs/api.md §5). See BUILD.md for the toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
root="$(git rev-parse --show-toplevel)"

anchor build --no-idl
mkdir -p target/idl target/types "$root/idl"
# Anchor 0.30.1 generates the IDL with a nightly compiler.
(cd programs/reliefpool && RUSTUP_TOOLCHAIN="${IDL_TOOLCHAIN:-nightly-2025-04-15}" \
  anchor idl build -o "$PWD/../../target/idl/reliefpool.json" -t "$PWD/../../target/types/reliefpool.ts")
cp target/idl/reliefpool.json target/types/reliefpool.ts "$root/idl/"
echo "IDL and types written to $root/idl/"

# ReliefPool 链上程序

基于 Anchor 0.30.1 的程序，负责资金池、捐款和赔付。接口约定见 [docs/api.md §5](../../docs/api.md#5-on-chain-interface-solana-program)。English: [README.md](README.md)。

## 工具链

- Rust stable，外加 `nightly-2025-04-15`（Anchor 0.30.1 用它生成 IDL）：`rustup toolchain install nightly-2025-04-15`
- Solana CLI 3.1.10：`sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"`
- Anchor CLI 0.30.1，需要用 Rust 1.79 编译（新版编译器会在 `time` crate 上报错）：
  `cargo +1.79.0 install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked`
- `Cargo.lock` 里的 `proc-macro2` 固定在 1.0.94，更新的版本会让 Anchor 0.30.1 编译失败，不要对它执行 `cargo update`。

## 构建、测试、部署

```bash
npm install
./scripts/build.sh                 # 编译程序并生成 IDL，同时把 IDL 和类型文件复制到仓库根目录的 idl/
anchor test --skip-build           # 在本地验证节点上跑 19 个测试（Anchor.toml 默认集群是 Localnet）
./scripts/deploy-devnet.sh         # 需要程序密钥对，见下文
npx tsx scripts/setup-demo-pool.ts # 按 demo-pool.json 搭建演示资金池，默认连 devnet
```

- **程序密钥对：** `declare_id!` 里的地址对应 `~/.config/solana/reliefpool-program-keypair.json`，由 Khan 保管。只有持有这个密钥对才能部署或升级程序，绝对不要提交到仓库。
- **setup 脚本：** 依次初始化资金池、按顺序注册响应方、完成每笔捐款。已经做过的步骤会自动跳过，可以重复运行。响应方和捐款方的密钥对生成在 `~/.config/solana/reliefpool-demo/`（仓库之外）。捐款方余额不够时会跳过并打印它的地址，充值后重新运行即可。脚本最后会打印 `backend/oracle/.env` 需要的值，以及 `backend/oracle/pool.config.json` 里的 `labels`。
- setup 脚本的环境变量：`RPC_URL`（默认 devnet）、`ADMIN_KEYPAIR`（默认 `~/.config/solana/id.json`）、`WALLET_DIR`。


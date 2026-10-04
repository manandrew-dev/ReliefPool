# ReliefPool Oracle 服务

English: [README.md](README.md)

oracle 从 USGS 读取地震数据，交给 classifier 打分；分数达到资金池阈值时，调用 Solana 程序的 `trigger_payout`。它同时提供前端使用的 REST API（[docs/api.md](../../docs/api.md) §3）。计划文档：[docs/oracle-plan.zh.md](../../docs/oracle-plan.zh.md)。

## 运行

需要 Node 20 及以上版本。

```bash
cd backend/oracle
npm install
npm run dev        # http://localhost:3001/api，改代码后自动重启
```

不配置 `.env` 时，服务完全运行在 mock 模式：classifier 用本地公式代替，链上交易也是模拟的。要修改配置，把 `.env.example` 复制为 `.env`。主要开关：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `MOCK_CLASSIFIER` | `true` | 设为 `false` 时，调用 `CLASSIFIER_URL` 上 Keith 的服务；`/health` 会显示他的 `modelVersion`（`rules-v1` 或 `model-v1`） |
| `MOCK_CHAIN` | `true` | 设为 `false` 时，使用真实的链上程序，见[真实链上程序](#真实链上程序) |
| `POLL_ENABLED` | `true` | 每隔 `POLL_INTERVAL_MS` 拉取一次 USGS 实时数据 |
| `MIN_MAGNITUDE` | `5.0` | 区域内震级低于这个值的地震，存为 0 分，不送去打分 |

演示区域和 `GET /pool` 用到的钱包名称在 `pool.config.json` 里设置。

## 事件处理流程

实时事件和 replay 事件走同一条流程（[src/pipeline.ts](src/pipeline.ts)）：

1. 跳过已经处理过的事件，以及不在区域内的事件。
2. 从链上读取阈值。
3. 震级低于 `MIN_MAGNITUDE`：`riskScore` 设为 0，流程结束。
4. 调用 classifier 打分，只发送契约规定的 5 个字段（[docs/api.md](../../docs/api.md) §4）。classifier 不可用、拒绝请求或返回内容不符合契约时，事件标为 `failed`（原因分别为 `CLASSIFIER_UNAVAILABLE`、`CLASSIFIER_REJECTED`、`CLASSIFIER_INVALID_RESPONSE`），**绝不打款**。
5. 分数低于阈值：状态为 `scored`，流程结束。
6. 发送 `trigger_payout`：状态变为 `pending`，链上确认后变为 `paid`；交易失败则变为 `failed`，并记录程序返回的错误名。

事件打完分之后才会存储，所以只有 `failed` 的事件 `riskScore` 才为 `null`。`POST /replay` 会等第 1~6 步完成后再返回，此时事件状态为 `scored`、`pending` 或 `failed`；`paid` 状态稍后通过 `GET /events` 获取。每次状态变化都会写入 `data/events.json`，所以重启后交易签名不会丢失。

## Replay 场景

`scenarios.json` 里存的是 USGS 的真实地震数据，所以 replay 和实时数据的格式完全一致：

| ID | 地震 | mock 分数（阈值 70） | 结果 |
|---|---|---|---|
| `jp-2025-m48` | 2025 年，大船渡近海 M4.8 | 0（低于 `MIN_MAGNITUDE`） | 不打款 |
| `jp-2013-m69-deep` | 2013 年，带广附近 M6.9，深度 107 km | 27 | 不打款 |
| `jp-2022-m73` | 2022 年，福岛近海 M7.3 | 77 | 打款 |
| `tohoku-2011-m91` | 2011 年，东北大地震 M9.1 | 100 | 打款 |

```bash
curl -X POST localhost:3001/api/replay -H 'Content-Type: application/json' \
  -d '{"scenarioId":"jp-2022-m73","runId":"r1"}'
```

不带 `runId` 时，同一个场景第二次 replay 会返回 `409`，这正是防重复打款在起作用。要修改场景列表，编辑 `scripts/build-scenarios.ts`，然后运行 `npm run scenarios:build`。

## 给前端

`fixtures/events.sample.json` 是一份 `GET /events` 的示例响应，覆盖全部四种状态：`scored`、`pending`、`paid`、`failed`。

程序部署之前，`GET /pool` 里的 `programId`、`poolAddress`、`vaultAddress` 都返回 `null`。

## 真实链上程序

设置 `MOCK_CHAIN=false` 后，oracle 通过程序的 IDL 调用已部署的程序（[src/solana.ts](src/solana.ts)）。需要这些配置：

| 变量 | 含义 |
|---|---|
| `IDL_PATH` | 程序的 IDL，默认 `../../idl/reliefpool.json`（由程序负责人提交） |
| `POOL_ADDRESS` | 演示池的 PDA，必填 |
| `PROGRAM_ID`、`VAULT_ADDRESS` | 可选。留空时，分别从 IDL 读取、由池地址推导；如果填了，必须和推导结果一致 |
| `RPC_URL`、`ORACLE_KEYPAIR_PATH` | devnet RPC 和 oracle 的签名密钥 |

启动时，oracle 会检查 IDL 是否包含它依赖的内容（docs/api.md §5）：`trigger_payout(event_id: string, risk_score: u8)`，账户为 `pool`、`vault`、`payout_record`、`oracle`、`system_program`，以及 `Pool.threshold`、`Pool.responders`、`PayoutRecord.amount`。缺少任何一项都会直接退出，并列出不一致的地方。

Responder 按 `Pool.responders` 的顺序，作为可写的 remaining accounts 传入。赔付交易会先做预检（preflight），所以 `InsufficientFunds` 这类程序错误会让事件立即变成 `failed`，失败原因就是该错误名；只有上链后才出现的错误，会让事件从 `pending` 变成 `failed`。

`test/fixtures/reliefpool.idl.json` 是按 api.md §5 写的替身 IDL，在真实 IDL 提交之前供测试使用。

## Oracle 密钥

```bash
npm run keygen     # 生成 oracle-keypair.json（已被 git 忽略），并打印公钥
npm run airdrop    # 领取 devnet SOL 用来付手续费；被限流时请用 https://faucet.solana.com
```

不要提交 `oracle-keypair.json` 或 `.env`，只分享公钥。

## 测试

```bash
npm test           # 测试处理流程、存储、HTTP 接口和链上程序客户端
npm run typecheck
```

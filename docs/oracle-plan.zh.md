# ReliefPool：Oracle Service 工作计划（Khan）

## Context

ReliefPool 是一个 24 小时 hackathon 项目：合作方把 SOL 存进链上资金池，发生地震时，若海啸风险分数达到阈值，就自动给当地救援方打款。团队分工：Andrew 做前端，Alice 做 Solana/Anchor 程序，Keith 做 Classifier，**Khan（我）做 Oracle Service**。

Oracle 处在系统中间，其余三部分都要和它对接：读取 USGS 数据 → 调用 Keith 的 classifier → 调用 Alice 的 `trigger_payout` → 向 Andrew 的前端提供 REST API。因此，**对接契约要最早定下来，并且要先基于 mock 开发**（[requirements.md](requirements.md) §10 的风险项也是这么要求的）。

本文档依据 [requirements.md](requirements.md)（v0.2）和 [api.md](api.md) 编写。我负责的需求：FR-10~15、FR-30、NFR-1/2/4/5/7，以及 [api.md](api.md) 第 3 节的全部接口。代码放在 `backend/oracle/`，在 `kehan` 分支上开发。

**v0.2 的变化：** classifier 改为比赛期间现训一个基础模型，并在同一个 `/score` 接口后面先放一个规则打分器作为兜底（FR-32、FR-33）。对 oracle 来说，这意味着第 1 小时就有真实的 `/score` 可以调用；但模型替换规则打分器之后，分数可能会变。

**配套文件：** 英文版见 [oracle-plan.md](oracle-plan.md)（内容一致）。

---

## 1. Classifier 接口契约和演示数据

**现状：和 Keith 的接口契约已经锁定**，见 [ReliefPool_ML_Oracle_Interface_Contract.docx](ReliefPool_ML_Oracle_Interface_Contract.docx)，[api.md](api.md) §4 有摘要。oracle 已经按契约实现。

- **请求：** 只发 `eventId`、`magnitude`、`depthKm`、`latitude`、`longitude` 这 5 个字段，全部必填。不使用 `cdi`、`mmi`、`sig`、民众震感报告这类地震发生后才有的字段，因为实时地震刚发生时它们经常缺失。
- **响应：** `eventId`（必须和请求一致）、`riskScore`（0~100 的整数）、`modelVersion`（`rules-v1` 或 `model-v1`），以及 `probability`（只有模型才返回）。
- **阈值：** 由资金池决定，不由 classifier 决定。分数和阈值的比较由 oracle 来做。
- **数据缺失：** oracle 绝不自己填值。实时事件缺字段时先跳过，下一次轮询时再处理。
- **出错：** classifier 不可用、拒绝请求，或者返回内容不符合契约，事件都会标为 `failed`，绝不当作低风险处理。

**训练数据：** Keith 正在把原来的数据集（`earthquake_data_tsunami.csv`，未提交到仓库）换成更可靠的数据集。原来的 CSV 有标签问题：`tsunami` 列是 USGS 的一个标记，2013 年以前的事件全是 0，连 2011 年东北大地震也是。无论他用哪份数据，接口契约都不变。如果新数据支撑不了这 4 个特征中的某一个，他会在改接口之前先通知我。

### 演示场景（日本东海岸区域）

replay 用的是 USGS 的真实地震，用稳定的 USGS 事件 ID 标识（不用 CSV 行号），所以数据格式和实时 feed 完全一样。

| Scenario ID | USGS ID | 地震 | 预期结果 |
|---|---|---|---|
| `jp-2025-m48` | `us6000q4y3` | 2025 年，大船渡近海 M4.8 | 不打款（低于 `MIN_MAGNITUDE`，不送去打分） |
| `jp-2013-m69-deep` | `usc000f03a` | 2013 年，带广附近 M6.9，深度 107 km | 不打款 |
| `jp-2022-m73` | `us6000h519` | 2022 年，福岛近海 M7.3 | 打款 |
| `tohoku-2011-m91` | `official20110311054624120_30` | 2011 年，东北大地震 M9.1 | 打款 |

- Keith 会把这些 USGS ID 排除在训练集之外，这样演示的都是模型没见过的事件。
- 按照契约，**不能为了让这些场景得到想要的结果，去调整模型或阈值。** 先根据分数分布定阈值，再看每个场景落在哪一侧。如果某个场景落在了不想要的一侧，就换一个真实地震，而不是去改模型。

---

## 2. 我提供什么 / 我需要什么

### 我提供给 Andrew（前端）
| 内容 | 时间 |
|---|---|
| `http://localhost:3001/api` 上的 `/health`、`/pool`、`/events`、`/events/:id`、`/replay/scenarios`、`POST /replay`，格式严格按照 api.md §3 | 第 2 小时前先给 mock 版本（返回写死的假数据），之后逐步换成真实数据 |
| 一个示例 JSON 文件 `fixtures/events.sample.json`，覆盖 `scored`/`pending`/`paid`/`failed` 四种状态 | 第 1 小时 |
| 已开启 CORS（允许 `http://localhost:3000`） | 第 1 天起就开启 |
| `GET /pool` 里的 `programId`、`poolAddress`、`vaultAddress`、地区名称和边界、钱包名称标签 | 等 Alice 部署后填入真实值 |

### 我提供给 Alice（链上程序）
| 内容 | 时间 |
|---|---|
| **Oracle 公钥**（我用 `solana-keygen new -o oracle-keypair.json` 生成，私钥不进仓库）。`initialize_pool` 需要用到 | 第 1 小时 |
| 给 oracle 钱包领 devnet SOL，用来支付手续费 | 第 1 小时 |
| 我这边的调用方式：`program.methods.triggerPayout(eventId, riskScore).accounts({...})`，需要她确认账户列表 | 第 1 小时对齐 |
| 联调时反馈链上报错（`BelowThreshold`、`InsufficientFunds` 等） | 联调阶段 |

### 我需要从 Alice 那里拿到
- **IDL JSON**：提交到仓库的 `idl/reliefpool.json`，并随程序接口一起更新（[api.md](api.md) §5）。即使程序还没写完，也请她尽早给一版"接口先行"的 IDL。
- **Program ID**，以及部署后的 **Pool 地址**（或 admin 公钥 + region_id，我可以自己推导 PDA）。
- `trigger_payout` 需要的**完整账户列表**（pool、vault、payout_record、oracle signer、每个 responder 的钱包是否走 `remaining_accounts`？）。**这一点必须问清楚**，否则交易一定会失败。
- 打款金额的规则：是按单次上限（cap）付，还是付出整个金库（扣除 rent 后）？（requirements §13 的待定问题。）这决定了我怎么填 `amountLamports`。我更倾向于在交易确认后**直接读取 PayoutRecord.amount**，这样就不用关心具体规则。
- 由谁写 setup 脚本（`initialize_pool` + `register_responder`）？建议 Alice 负责，我负责提供 oracle 公钥。

### 我需要从 Keith 那里拿到
已经拿到：接口契约（见 §1）。还需要：

- **规则打分器（`rules-v1`）在 `8000` 端口上跑起来**，提供 `POST /score` 和 `GET /health`。uvicorn 启动时要加 `--host 0.0.0.0`，否则其他容器访问不到。
- **分数分布：** 低风险和高风险地震大概各得多少分，用来一起确定阈值（比如 70）。
- **§1 中 4 个演示 USGS ID 的分数**，`rules-v1` 和 `model-v1` 各一份。
- **确认这些 USGS ID 已经排除在训练集之外。**
- **从 `rules-v1` 切换到 `model-v1` 之前先通知我**，方便我重新核对阈值和演示场景的分数。

### 需要全队一起决定（第 1 小时）
1. **演示区域**：日本东海岸（大致 lat 30~46，lon 135~150）。§1 的演示场景都在这个区域内。
2. **threshold 数值**（和 Keith 一起定）。
3. **Event ID 规则**：USGS ID 本身就很短（例如 `us7000abcd`）；replay 用 `<scenarioId>-<runId>` 格式，长度必须 ≤ 32 字节。
4. 仓库目录已经定好：`program/`、`backend/oracle/`、`backend/classifier/`、`frontend/`。每个组件各自放一份 `.env.example`。每人在自己的分支上开发，通过 PR 合入 `main`。

---

## 3. 技术方案

**技术栈：** Node + TypeScript + Express，使用 `@solana/web3.js`（再根据 IDL 选合适的客户端；[api.md](api.md) §5 允许 oracle 使用任何遵循 IDL 的客户端）。存储用内存 + `backend/oracle/data/events.json`（不进 git；每次状态变化都写入，防止演示中途重启丢失交易签名，这也回答了 [api.md](api.md) §7 的问题）。

### 目录结构
```
backend/oracle/
  src/
    index.ts          # 启动：加载配置、恢复存储、启动 poller、启动 express
    config.ts         # 读取 env：RPC_URL, PROGRAM_ID, POOL_ADDRESS, ORACLE_KEYPAIR_PATH,
                      #           CLASSIFIER_URL, POLL_INTERVAL_MS, REGION_*, MIN_MAGNITUDE, MOCK_CLASSIFIER, MOCK_CHAIN
    store.ts          # Map<id, QuakeEvent> + 持久化到 JSON + 查询(limit/status/since)
    usgs.ts           # 拉取 feed，并把 GeoJSON feature 转成内部事件
    region.ts         # 判断事件是否在 bounding box 内
    classifier.ts     # POST /score，带超时(3s)和 1 次重试；仅在 MOCK_CLASSIFIER=true 时用本地公式
    chain.ts          # Solana 客户端：读取 Pool(threshold)、检查 PayoutRecord 是否存在、发送 trigger_payout
    pipeline.ts       # processEvent(evt)：live 和 replay 共用的同一条处理流程
    scenarios.ts      # 读取 scenarios.json
    routes.ts         # api.md §3 的全部接口 + 统一错误格式
  scenarios.json      # 演示场景，从 USGS 目录缓存到本地
  scripts/build-scenarios.ts  # 一次性脚本：按演示用的 USGS ID 拉取数据，写入 scenarios.json
  fixtures/events.sample.json
  .env.example        # 不提交 .env、*.json 密钥文件（写入 .gitignore）
```

### 核心流程 `processEvent`（live 和 replay 走同一路径，满足 FR-30）
1. **去重（FR-14 / NFR-5）**：如果 store 里已有该 id，live 事件直接跳过；replay 返回 `409 EVENT_ALREADY_PROCESSED`。
2. **区域过滤（FR-11）**：不在区域内就丢弃，也不存储。区域内但低于 `MIN_MAGNITUDE` 的事件，存为 `scored`、`riskScore: 0`，不送去 classifier。
3. 把这个 ID 标记为"处理中"（下一次轮询或重复的 replay 会跳过它），并设置 `processedAt`。事件打完分或失败之后才写入存储，所以只有 `failed` 的事件 `riskScore` 才为 `null`（[api.md](api.md) §3.1）。
4. **评分（FR-12）**：调用 classifier。如果失败，就设为 `status: "failed"`，`failureReason: "CLASSIFIER_UNAVAILABLE"`，然后**结束，绝不打款（NFR-7）**。
5. 从链上读取 Pool 的 `threshold`（缓存 30 秒），写进事件。
6. 如果 `score < threshold`，状态设为 `scored`，流程结束。
7. 如果 `score ≥ threshold`（FR-15）：
   - 先查 PayoutRecord PDA（`"payout", pool, eventId`）是否已存在。如果存在，标记为已处理，不再发送交易（双重保险，链上本身也会拒绝）。
   - 发送 `trigger_payout(eventId, score)`，然后把状态设为 `pending` 并写入 `payout.signature`、`explorerUrl`。
   - 以 `confirmed` commitment 等待确认（满足 NFR-1 的 5 秒要求）。确认后状态改为 `paid`，写入 `confirmedAt`，再读取 PayoutRecord 填入 `amountLamports`。
   - 如果链上报错，状态设为 `failed`，`failureReason` 写入 Anchor 错误名（例如 `InsufficientFunds`）。
8. 每一步都写回 JSON 文件。

### USGS 轮询（FR-10 / NFR-2）
- 地址：`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`，每 30 秒拉一次，满足 60 秒内上屏的要求。
- 字段映射：`id`、`properties.mag`、`properties.place`、`properties.time`（毫秒，转为 ISO）、`geometry.coordinates = [lon, lat, depthKm]`。缺少震级、深度或位置的事件会被跳过。因为没有存储，等 USGS 补全字段后，下一次轮询会重新处理它。
- 拉取失败时只记日志、更新 `/health`，不影响其他流程。`lastFeedPollAt` 只在拉取成功时更新。

### 启动恢复
重启时如果有 `pending` 状态的事件，就重新查询该签名的确认状态，再把状态补成 `paid` 或 `failed`。

### Mock 开关（让我不依赖其他人就能开发）
- `MOCK_CLASSIFIER=true`：用本地公式代替 classifier，公式为 `score = clamp((mag-6)*70 - depth/3, 0, 100)`。threshold 为 70 时，不打款的演示地震得 27 分，打款的演示地震得 77 分，东北大地震得 100 分。这时 `modelVersion` 为 `"mock"`。Keith 的规则打分器第 1 小时就会上线，所以这个开关只在离线开发或他的服务挂掉时使用。
- `MOCK_CHAIN=true`：threshold 固定为 70，`trigger_payout` 返回一个假签名，延迟 1 秒后变为 `paid`。
- 这样 Andrew 从第 2 小时起就能连接一个"会动"的后端。

---

## 4. 时间线（24 小时）

| 时间段 | 我要做的 | 和谁对接 |
|---|---|---|
| 0–1h | 开对齐会议：确定区域、threshold、event ID 规则、`trigger_payout` 账户列表、classifier 字段；生成 oracle keypair 并领 SOL；把公钥给 Alice；给 Andrew 示例 JSON | 全队 |
| 1–3h | 搭建 Express 框架、全部路由（先返回 mock 数据）、统一错误格式、CORS、store + JSON 持久化 | Andrew 开始接入 |
| 3–6h | 完成 USGS poller + 区域过滤 + `MIN_MAGNITUDE`；对演示用的 USGS ID 运行 `build-scenarios.ts`，生成 `scenarios.json`；完成 `POST /replay`；pipeline 在两个 mock 模式下完整跑通 | — |
| 6–9h | 把 oracle 接到 Keith 的 `/score`（先接规则打分器），处理超时和失败。他换上训练好的模型后，重新核对 threshold 和 replay 场景的分数 | Keith |
| 9–14h | 拿到 IDL 后写 `chain.ts`：读取 Pool、检查 PayoutRecord、发送 `trigger_payout`；在 devnet 上打通第一笔 payout | Alice |
| 14–18h | 全链路联调：按验收标准 1–7 逐条跑；修复错误映射和启动恢复 | 全队 |
| 18–21h | 加固：`/health` 真实反映 classifier 和 solana 状态；写 README 中 oracle 的部分（NFR-10）；录一段备用演示视频 | Andrew 录屏 |
| 21–24h | 演示彩排（用 `runId` 反复 replay）；时间充裕的话做 stretch：SSE `/events/stream` | — |

**兜底方案：** 如果到第 12 小时链上程序还没上 devnet，我继续以 `MOCK_CHAIN` 模式演示后端流程，同时协助 Alice（比如帮她写 setup 脚本或测试）。

---

## 5. 验证方式

1. **单独测 oracle（mock 模式）：**
   - `curl localhost:3001/api/health`
   - `curl localhost:3001/api/replay/scenarios`
   - `curl -X POST localhost:3001/api/replay -d '{"scenarioId":"jp-2013-m69-deep"}'`：之后 `GET /events` 应显示 `scored`
   - 用 `jp-2022-m73` 重复上一步：`202` 响应里已经是带分数的 `pending`，大约一秒后 `GET /events` 显示 `paid`
   - 对 `jp-2022-m73` 再发一次：应返回 `409`
   - 加上 `runId` 再发：应成功
2. **Classifier 契约：** 启动 Keith 的服务并设置 `MOCK_CLASSIFIER=false` 后，每个 `/score` 请求都只包含契约规定的 5 个字段，`/health` 里的 `classifierModelVersion` 显示 `rules-v1` 或 `model-v1`。自动化测试见 `test/classifier.test.ts`。
3. **classifier 故障测试：** 关掉 Keith 的服务后 replay，事件应为 `failed`，且链上没有交易（NFR-7）。
4. **devnet 端到端（对应 [requirements.md](requirements.md) §11 验收标准）：** 低分事件不打款；高分事件 5 秒内确认，且各 responder 的余额按份额增加；explorer 链接能打开；同一事件再次 replay 不会产生第二笔打款。
5. **重启测试：** 在 `paid` 之后杀掉进程再重启，`GET /events?status=paid` 仍然能看到签名。
6. **安全检查：** 执行 `git status` 确认 `oracle-keypair.json` 和 `.env` 没有被跟踪（NFR-4）。


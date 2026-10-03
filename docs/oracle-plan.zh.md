# ReliefPool：Oracle Service 工作计划（Khan）

## Context

ReliefPool 是一个 24 小时 hackathon 项目：合作方把 SOL 存进链上资金池，发生地震时，若海啸风险分数达到阈值，就自动给当地救援方打款。团队分工：Andrew 做前端，Alice 做 Solana/Anchor 程序，Keith 做 Classifier，**Khan（我）做 Oracle Service**。

Oracle 处在系统中间，其余三部分都要和它对接：读取 USGS 数据 → 调用 Keith 的 classifier → 调用 Alice 的 `trigger_payout` → 向 Andrew 的前端提供 REST API。因此，**对接契约要最早定下来，并且要先基于 mock 开发**（[requirements.md](requirements.md) §10 的风险项也是这么要求的）。

本文档依据 [requirements.md](requirements.md)（v0.2）和 [api.md](api.md) 编写。我负责的需求：FR-10~15、FR-30、NFR-1/2/4/5/7，以及 [api.md](api.md) 第 3 节的全部接口。代码放在 `backend/oracle/`，在 `kehan` 分支上开发。

**v0.2 的变化：** classifier 改为比赛期间现训一个基础模型，并在同一个 `/score` 接口后面先放一个规则打分器作为兜底（FR-32、FR-33）。对 oracle 来说，这意味着第 1 小时就有真实的 `/score` 可以调用；但模型替换规则打分器之后，分数可能会变。

**配套文件：** 英文版见 [oracle-plan.md](oracle-plan.md)（内容一致）。

---

## 1. 我提供什么 / 我需要什么

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
- **IDL JSON + TS types**（`target/idl/*.json`、`target/types/*.ts`）。即使程序还没写完，也请她尽早给一版"接口先行"的 IDL。
- **Program ID**，以及部署后的 **Pool 地址**（或 admin 公钥 + region_id，我可以自己推导 PDA）。
- `trigger_payout` 需要的**完整账户列表**（pool、vault、payout_record、oracle signer、每个 responder 的钱包是否走 `remaining_accounts`？）。**这一点必须问清楚**，否则交易一定会失败。
- 打款金额的规则：是按单次上限（cap）付，还是付出整个金库（扣除 rent 后）？（requirements §13 的待定问题。）这决定了我怎么填 `amountLamports`。我更倾向于在交易确认后**直接读取 PayoutRecord.amount**，这样就不用关心具体规则。
- 由谁写 setup 脚本（`initialize_pool` + `register_responder`）？建议 Alice 负责，我负责提供 oracle 公钥。

### 我需要从 Keith 那里拿到
- **第 1 小时先上线规则打分器**（FR-32），让我直接调用真实接口，而不是自己的 mock。
- `POST /score` 的**最终输入字段**（api.md §4 写明"字段是猜的"）。**第 1 小时锁定**；之后训练好的模型（FR-33）替换规则打分器时，字段保持不变，oracle 就不用改。
- 分数的分布：低风险和高风险地震大概各得多少分，用来**确定 threshold**（比如 70）。
- 两个 replay 场景（一个低于阈值、一个高于阈值），请他分别用规则打分器和训练好的模型各跑一遍，确保无论演示时用哪一个，分数都落在阈值两侧。
- 端口为 `8000`，提供 `GET /health`，单次评分最好在 2 秒以内返回。返回中的 `modelVersion` 要能区分分数是规则打分器给的，还是模型给的。

### 需要全队一起决定（第 1 小时）
1. **演示区域**：建议选日本东海岸（大致 lat 30~46，lon 135~150），这样 2011 年东北大地震（M9.1）可以作为 payout 场景，同一区域的一次小地震作为 no_payout 场景。
2. **threshold 数值**（和 Keith 一起定）。
3. **Event ID 规则**：USGS ID 本身就很短（例如 `us7000abcd`）；replay 用 `<scenarioId>-<runId>` 格式，长度必须 ≤ 32 字节。
4. 仓库目录已经定好：`program/`、`backend/oracle/`、`backend/classifier/`、`frontend/`。每个组件各自放一份 `.env.example`。每人在自己的分支上开发，通过 PR 合入 `main`。

---

## 2. 技术方案

**技术栈：** Node + TypeScript + Express，使用 `@coral-xyz/anchor`、`@solana/web3.js`。存储用内存 + `data/events.json`（每次状态变化都写入，防止演示中途重启丢失交易签名，这也回答了 [api.md](api.md) §7 的问题）。

### 目录结构
```
backend/oracle/
  src/
    index.ts          # 启动：加载配置、恢复存储、启动 poller、启动 express
    config.ts         # 读取 env：RPC_URL, PROGRAM_ID, POOL_ADDRESS, ORACLE_KEYPAIR_PATH,
                      #           CLASSIFIER_URL, POLL_INTERVAL_MS, REGION_*, MOCK_CLASSIFIER, MOCK_CHAIN
    store.ts          # Map<id, QuakeEvent> + 持久化到 JSON + 查询(limit/status/since)
    usgs.ts           # 拉取 feed，并把 GeoJSON feature 转成内部事件
    region.ts         # 判断事件是否在 bounding box 内
    classifier.ts     # POST /score，带超时(3s)和 1 次重试；仅在 MOCK_CLASSIFIER=true 时用本地公式
    chain.ts          # Anchor client：读取 Pool(threshold)、检查 PayoutRecord 是否存在、发送 trigger_payout
    pipeline.ts       # processEvent(evt)：live 和 replay 共用的同一条处理流程
    scenarios.ts      # 写死的历史 replay 场景
    routes.ts         # api.md §3 的全部接口 + 统一错误格式
  fixtures/events.sample.json
  .env.example        # 不提交 .env、*.json 密钥文件（写入 .gitignore）
```

### 核心流程 `processEvent`（live 和 replay 走同一路径，满足 FR-30）
1. **去重（FR-14 / NFR-5）**：如果 store 里已有该 id，live 事件直接跳过；replay 返回 `409 EVENT_ALREADY_PROCESSED`。
2. **区域过滤（FR-11）**：不在区域内就丢弃，也不存储。
3. 写入 store，此时 `riskScore: null`、`status: "scored"`，并设置 `processedAt`。
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
- 字段映射：`id`、`properties.mag`、`properties.place`、`properties.time`（毫秒，转为 ISO）、`geometry.coordinates = [lon, lat, depthKm]`。
- 拉取失败时只记日志、更新 `/health`，不影响其他流程。`lastFeedPollAt` 只在拉取成功时更新。

### 启动恢复
重启时如果有 `pending` 状态的事件，就重新查询该签名的确认状态，再把状态补成 `paid` 或 `failed`。

### Mock 开关（让我不依赖其他人就能开发）
- `MOCK_CLASSIFIER=true`：用本地公式代替 classifier，例如 `score = clamp((mag-5)*25 - depth/10)`。Keith 的规则打分器第 1 小时就会上线，所以这个开关只在离线开发或他的服务挂掉时使用。
- `MOCK_CHAIN=true`：threshold 固定为 70，`trigger_payout` 返回一个假签名，延迟 1 秒后变为 `paid`。
- 这样 Andrew 从第 2 小时起就能连接一个"会动"的后端。

---

## 3. 时间线（24 小时）

| 时间段 | 我要做的 | 和谁对接 |
|---|---|---|
| 0–1h | 开对齐会议：确定区域、threshold、event ID 规则、`trigger_payout` 账户列表、classifier 字段；生成 oracle keypair 并领 SOL；把公钥给 Alice；给 Andrew 示例 JSON | 全队 |
| 1–3h | 搭建 Express 框架、全部路由（先返回 mock 数据）、统一错误格式、CORS、store + JSON 持久化 | Andrew 开始接入 |
| 3–6h | 完成 USGS poller + 区域过滤；完成 replay 场景和 `POST /replay`；pipeline 在两个 mock 模式下完整跑通 | — |
| 6–9h | 把 oracle 接到 Keith 的 `/score`（先接规则打分器），处理超时和失败。他换上训练好的模型后，重新核对 threshold 和 replay 场景的分数 | Keith |
| 9–14h | 拿到 IDL 后写 `chain.ts`：读取 Pool、检查 PayoutRecord、发送 `trigger_payout`；在 devnet 上打通第一笔 payout | Alice |
| 14–18h | 全链路联调：按验收标准 1–7 逐条跑；修复错误映射和启动恢复 | 全队 |
| 18–21h | 加固：`/health` 真实反映 classifier 和 solana 状态；写 README 中 oracle 的部分（NFR-10）；录一段备用演示视频 | Andrew 录屏 |
| 21–24h | 演示彩排（用 `runId` 反复 replay）；时间充裕的话做 stretch：SSE `/events/stream` | — |

**兜底方案：** 如果到第 12 小时链上程序还没上 devnet，我继续以 `MOCK_CHAIN` 模式演示后端流程，同时协助 Alice（比如帮她写 setup 脚本或测试）。

---

## 4. 验证方式

1. **单独测 oracle（mock 模式）：**
   - `curl localhost:3001/api/health`
   - `curl localhost:3001/api/replay/scenarios`
   - `curl -X POST localhost:3001/api/replay -d '{"scenarioId":"replay-minor-01"}'`：之后 `GET /events` 应显示 `scored`
   - 用 `replay-major-01` 重复上一步：状态应依次经过 `pending` 和 `paid`
   - 对 `replay-major-01` 再发一次：应返回 `409`
   - 加上 `runId` 再发：应成功
2. **classifier 故障测试：** 关掉 Keith 的服务后 replay，事件应为 `failed`，且链上没有交易（NFR-7）。
3. **devnet 端到端（对应 [requirements.md](requirements.md) §11 验收标准）：** 低分事件不打款；高分事件 5 秒内确认，且各 responder 的余额按份额增加；explorer 链接能打开；同一事件再次 replay 不会产生第二笔打款。
4. **重启测试：** 在 `paid` 之后杀掉进程再重启，`GET /events?status=paid` 仍然能看到签名。
5. **安全检查：** 执行 `git status` 确认 `oracle-keypair.json` 和 `.env` 没有被跟踪（NFR-4）。


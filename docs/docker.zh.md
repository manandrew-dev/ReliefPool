# 用 Docker 运行 ReliefPool

English: [docker.md](docker.md)

Docker Compose 会运行 classifier、oracle 和前端。Solana 合约不放进容器：它已经部署在 devnet 上（`docs/api.md` §5.6）。

| 服务 | 本机地址 | 镜像 |
|---|---|---|
| 前端 | http://localhost:8080 | `frontend/Dockerfile`：Vite 构建，由 nginx 提供 |
| Oracle | http://localhost:3001/api | `backend/oracle/Dockerfile` |
| Classifier | http://localhost:8000 | `backend/classifier/Dockerfile`，使用仓库里提交的 `model-v1` 模型 |

需要 Docker，以及 v2.17 或更新的 Compose（Docker Desktop 自带）。

## 模拟链（默认）

```bash
docker compose up --build
```

打开 http://localhost:8080。不需要任何密钥。classifier 是真实的；oracle 模拟合约（阈值 70、每次支付 0.1 SOL、假的交易签名），所以回放和支付流程不依赖 Solana 也能跑。直接读链的卡片会显示 "Pool not deployed yet"，因为模拟链没有池子地址。

## devnet 上的真实合约

需要 oracle 的密钥对，只有 oracle 负责人持有（`backend/oracle/oracle-keypair.json`，已被 gitignore）：

```bash
docker compose -f docker-compose.yml -f docker-compose.devnet.yml up --build
```

密钥对以只读方式挂载进 oracle 容器，不会被复制进镜像。支付是真实的 devnet 交易，钱从演示池的金库出。

如果找不到密钥文件，Compose 会报错并指出路径（`bind source path does not exist`）。把密钥存到那个位置，再运行一次命令即可。

如果密钥对放在别处，或者要用另一个池子，可以在 shell 里或仓库根目录的 `.env` 文件（已被 gitignore）里设置：

| 变量 | 默认值 |
|---|---|
| `ORACLE_KEYPAIR` | `./backend/oracle/oracle-keypair.json` |
| `POOL_ADDRESS` | `5Mf43LGs8F95EE9Ucx2zNhTeC9eKDiYSP2VQZ22dckeV` |
| `RPC_URL` | `https://api.devnet.solana.com` |
| `POLL_ENABLED` | `true`。设为 `false` 可以停止轮询 USGS 实时数据，比如彩排的时候 |

## 注意事项

- **前端的配置是在构建时写死的。** Vite 会把 `VITE_*` 的值写进打包文件，所以它们在 `docker-compose.yml` 里是构建参数，不是运行时环境变量。改了之后要用 `docker compose build frontend` 重新构建。
- **浏览器直接调用 oracle**，所以 `VITE_ORACLE_URL` 是 `http://localhost:3001/api`（本机端口），不是 `http://oracle:3001`。如果改了 oracle 对外的端口，或者从别的源提供页面，要同时改 `VITE_ORACLE_URL` 和 oracle 的 `CORS_ORIGIN`。
- **事件会持久保存**在 `oracle-data` 数据卷里：模拟链用 `events.json`，devnet 用 `devnet-events.json`。`docker compose down -v` 会删掉它们，同时也会重置回放时不换事件 ID 的防重复支付记录。
- **启动顺序：** oracle 等 classifier 健康检查通过后才启动，前端等 oracle 健康检查通过后才启动。
- **IDL：** oracle 镜像会从仓库根目录复制 `idl/reliefpool.json`（即 `idl` 构建上下文）。IDL 改了之后要重新构建 oracle。

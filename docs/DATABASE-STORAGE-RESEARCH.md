# 数据库存储增长：调查与复用建议

调查日期：2026-10-26。范围：现有 Windows 原生启动、Convex 本地后端、SQLite；只读检查与资料研究，没有更改运行配置、安装依赖或删除数据。

## 结论

先治理整份世界反复写入产生的技术版本，再建设长期业务历史归档。当前没有证据表明必须更换数据库。推荐组合为：按更新频率拆文档 + 官方旧版本回收 + 现有历史压缩代码 + 可恢复的分批归档 + restic 去重备份。它们解决不同层的问题，不能互相替代。

## 本地证据

以下检查来自本次对运行数据库的只读查询，测量时间不同，数值会继续变化。

| 检查项 | 结果 | 解释 |
| --- | --- | --- |
| 后端配置版本 | `precompiled-2026-10-10-72ce13c` | 由 `.convex/local/default/config.json` 只提取版本字段 |
| 文明状态的当前文档 | 29 个，UTF-8 JSON 合计 3.246 MiB | 不是整个数据库的业务数据总量 |
| 同一组文档的全部版本 | 6963 个，UTF-8 JSON 合计 1.435 GiB | 最大占用来源之一是同一状态的重复版本 |
| 当前文档的内存压缩试算 | gzip level 6：0.478 MiB，约 6.79 倍 | 仅对此样本的无损压缩；不能推算整库缩减比例 |
| 较早一次主库页检查 | 空闲页数为 0 | 不支持把当前问题主要归因于删除后空页；仍可能存在页内碎片 |

现有 `convex/civilization.ts` 的 `tick` 每秒调用 `heartbeat`、`persist`，`persist` 再更新包含整个 `state` 的世界文档。当前事件、决策等数组虽然有限长，整个状态的历史版本仍会累积。

业务历史已经写入 `civilizationRecords`、`civilizationPeople`。分支通过 `parent`、`forkDay`、`forkSerial` 继承祖先历史，现成的 `lineage` 截止规则应继续复用。现有每日业务清理只涉及 `inputs`、`memories`、`memoryEmbeddings`，不负责后端 MVCC 版本回收。

## 1. 官方旧版本回收：先核实，再小范围调整

对应本地版本的官方源码中，`DOCUMENT_RETENTION_DELAY` 默认 14 天，`INDEX_RETENTION_DELAY` 默认 4 分钟，可由后端进程环境变量覆盖。这里的旧文档版本与业务事件历史是不同层次的数据；不能把两周以内的增长直接判断为回收故障。[对应版本源码](https://github.com/convex/convex-backend/blob/72ce13c/crates/common/src/knobs.rs#L596)

`scripts/windows.mjs` 构造子进程环境；已安装 Convex CLI 的 `runLocalBackend` 继承环境启动后端。若测试参数，应配置在真正的后端启动环境中；`convex env set` 是应用函数环境配置，不能假定它会改变 Rust 后端的进程参数。本次没有直接读取运行中后端的有效环境，因此 14 天是已确认的源码默认值，不是已确认的运行生效值。

候选实验：在独立的一致性数据库副本上，固定写入负载，比较默认值和较短窗口的旧版本量、回收进度、启动内存及查询表现。不要直接套用一小时之类的激进参数，也不要通过 SQL 手删 `documents`、`indexes` 或修改 `persistence_globals`。

上游 issue #358 报告过修改保留窗口后回收游标卡住的问题；这是风险线索，不是本项目已发生该故障的证据。[问题报告](https://github.com/convex/convex-backend/issues/358)

另有修复提交 `2ffe557`，把 SQLite 文档日志从一次性读入整个范围改为分页读取；本地对应版本的接口参数仍叫 `_page_size`，值得作为启动与回收内存问题的候选修复核查。调查时读取到的 `main` 原始文件仍有旧接口；未确认该提交已合并或进入 Windows 发布包，不能把“升级最新版”当成确定修复，也不能声称该补丁会直接缩小数据库。[本地版本对应源码](https://github.com/convex/convex-backend/blob/72ce13c/crates/sqlite/src/lib.rs#L449)、[修复提交](https://github.com/convex/convex-backend/commit/2ffe557)

## 2. 按更新频率拆文档：直接借鉴官方建议

将低频变化的身份、文字描述、地图底图，与高频变化的位置、库存、工作进度分开。人物按稳定 ID 管理，地图可按区域划分；同一次模拟更新在事务内提交，保留原有 loop、revision、lease 与服务端时钟语义。不能只把 `replace` 改成 `patch` 就声称消除了大文档版本：同一个大文档仍是同一个版本保存单位。

官方建议对高频变化字段与不常变化字段拆文档，并对长列表分页读取。[官方说明](https://stack.convex.dev/queries-that-scale)

这不是拆得越细越好。先测单步更新字节数、读取文档数与事务耗时，再决定人物、地图块的粒度。降低持久化频率也会改变崩溃恢复精度，需要单独设计，不能以省空间为由跳过真实小时模拟、随机调用或用户操作。

## 3. 优先复用项目已有的差分压缩

现有文件：

- `convex/engine/historicalObject.ts`：只跟踪变化的数值字段，打包历史样本。
- `convex/util/compression.ts`：差分编码、游程编码、量化。
- `convex/util/FastIntegerCompression.ts`：整数压缩。
- `src/hooks/useHistoricalValue.ts`：客户端解包与历史值显示。

原聊天小镇已在 `convex/aiTown/game.ts` 调用这一套。可借鉴到文明人物移动与展示曲线，避免再开发一套相同用途的编码器；需要适配文明人物 ID、服务器时间与字段结构。

边界：这是指定数值字段的有界历史工具，不是整个文明的通用恢复引擎。原实现含量化，对资源精确账本、随机数状态、身份关系不宜直接套用；压缩后的移动记录仍须来自真实执行，插值不能制造未执行的行为。

需要通用状态差分时，可评估 MIT 的 `jsondiffpatch`，它支持生成、应用与反转差分，数组需要提供稳定的 `objectHash`。人物用 `person.id`、建筑用 `building.id`，地图块用坐标键，不按数组下标识别人。[维护者文档](https://github.com/benjamine/jsondiffpatch)

优先把通用差分用于冷归档，采用“周期完整检查点 + 有界长度变化链”。每条记录包含前后版本、世界/分支 ID、校验值和格式版本；变化包比压缩完整包还大时回退完整包。不要先把热查询变成每次重放几千个补丁。

现有展示事件不足以精确回放每小时状态。若采用重跑规则的回放路线，必须另外保存规则版本、随机状态、外部 AI 结果及所有人工输入；若采用完整状态差分，必须验证逐段重建后与原状态一致。

## 4. 分批归档：复用队列机制，自己实现业务契约

Convex 的 `@convex-dev/batch-worker` 可复用为持久、可恢复的分批任务循环；`@convex-dev/migrations` 适合旧数据结构迁移。它们不自动提供历史归档、安全删除或 SQLite 压缩。[Batch Worker](https://github.com/get-convex/batch-worker)、[Migrations](https://github.com/get-convex/migrations)

本地第一版可由现有 Node 运行环境的独立归档进程完成文件写入与 gzip，避免额外引入云服务。Convex mutation 通过数据库接口分页读取与登记状态，不直接承担本机路径写文件；压缩文件由本地进程管理。

建议处理顺序：固定已关闭时间段与版本 → 导出不可变分块 → 写入记录数、版本范围、SHA256 清单 → 解压及抽样/完整恢复验证 → 登记归档索引 → 再处理可移出的主库明细。任务应幂等，失败可续跑；尚未结束的计划/决策不能归档成最终版本。

归档索引延续现有祖先分支截止规则。保留完整历史与做年度统计汇总是两件事：汇总可以加速图表，但不能代替要求保留的原始明细。

后续跨多年统计特别多时，再评估 Parquet + DuckDB：可按列和过滤条件减少扫描，适合分析历史指标，不承担 Convex 热状态事务。[DuckDB 官方文档](https://duckdb.org/docs/stable/data/parquet/overview)

## 5. 备份：复用 restic 的去重与保留策略

restic 支持 Windows、内容去重、压缩及快照保留，可替代每轮新增一个完整目录副本。对重复内容有节省潜力，但数据库页变化会影响去重率，压缩率与节省比例需要实测。[官方安装](https://restic.readthedocs.io/en/stable/020_installation.html)、[仓库设计](https://restic.readthedocs.io/en/stable/100_references.html)、[保留与整理](https://restic.readthedocs.io/en/stable/060_forget.html)

沿用项目已验证的停机完整目录备份流程，再交给 restic 管理；备份范围包括 SQLite、外部文件存储、配套源代码/版本与必要配置。单独用 SQLite Backup API 能得到数据库一致副本，但不自动保证同时变化的外部文件属于同一恢复点。[SQLite Backup API](https://www.sqlite.org/backup.html)

备份不是可在线查询的历史档案。保留策略删除旧恢复点前先验证恢复；同一 E 盘上的仓库也不能防止整盘损坏。此次只研究，没有安装 restic、生成新全量备份或淘汰旧副本。

## 建议落地顺序与验收

1. 加入轻量统计：当前有效数据字节数、旧版本字节数、每小时增长、后端启动峰值内存、归档量、剩余空间。
2. 优先拆分最重、更新最频繁的世界状态；不改变真实规则、时钟、人物身份、存档与分支语义。
3. 独立副本验证官方回收窗口与候选修复；确认回收完成后，再评估是否需要停机整理物理文件。文件未缩小不代表空间未被内部重用。
4. 接入分批压缩归档和 restic；做一次跨重启、跨分支的恢复演练。

验收应比较固定种子、固定模拟步数及外部决策下的状态一致性；核对人口、库存账本、随机状态、决策、身份关联与分支截止。记录优化前后的增长率，不能凭单次文件大小承诺节省比例。

当前不优先：直接迁移 PostgreSQL、为单机归档引入 Redis/Kafka/独立时序服务、压缩整个热状态使查询每次解包、仅保留事件摘要、直接删除 Convex 内部表。未来确有并发或规模需求时，再使用官方 SQL 后端路径；换存储并不会自动消除重复写入。[官方自托管说明](https://github.com/convex/convex-backend/blob/main/self-hosted/README.md)

补充候选核查见 [DATABASE-STORAGE-REUSE-NOTES.md](./DATABASE-STORAGE-REUSE-NOTES.md)。

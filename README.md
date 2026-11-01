# AI Town 开放文明模拟器

基于 [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) 扩展的本地文明模拟项目。保留上游 Git 历史与许可证，并保留原角色聊天小镇。

文明从原始条件出发，通过人物劳动、资源、环境与制度规则演化。当前包含连续步行、现场地形工程、组合制度、群体库存与继承、迁徙、外交和有限冲突。完整吞并、阶级形成和战后重建仍在开发，不能把规则测试视为真实人类文明的证明。

## 快速开始（Windows 原生）

1. 安装 Node.js 20+、Git 和 Ollama。安装、依赖缓存及模型下载前检查磁盘余量，优先使用非 C 盘。
2. 克隆本仓库后进入项目根目录，执行 `npm ci`。可用 `npm ci --cache E:/DeveloperCache/npm` 指定缓存。
3. 查看 `.env.defaults`，准备配置对应的 Ollama 模型；默认聊天模型 `qwen3.5:4b`，向量模型 `embeddinggemma:300m`。更换向量模型必须匹配代码中的索引维度。
4. 首次本地 Convex 初始化执行 `npx convex dev --local --once`，选择本地部署。依赖缺失或工具版本差异时参考 [Windows 说明](WINDOWS.md)，不要把其他电脑的部署密钥复制过来。
5. 启动 Ollama，双击 `Start-AI-Town.cmd` 或运行 `npm run dev:windows`。
6. 打开 http://127.0.0.1:5173/ai-town/ 。停止时双击 `Stop-AI-Town.cmd`。

首次安装流程在新机器上仍需验证；本机已有部署的启动已有验证。无需 WSL 或 Docker。世界默认暂停，手动继续；无人观察三十秒后自动保存暂停，重新打开不会自行继续。

## 开发与验证

| 命令 | 用途 |
|---|---|
| `npm run dev:windows` | Windows 本地服务与页面 |
| `npm run build` | 类型检查及前端构建 |
| `npm run lint` | 代码检查 |
| `npm run test:civilization` | 原生执行计算密集的引擎与时钟测试 |
| `npm test -- --runInBand --testPathIgnorePatterns 'convex/civilization/engine.test.ts' 'convex/civilization/clock.test.ts'` | 其余 Jest 测试；上面两套由原生运行器执行 |
| `npm run test:storage` | 存储生命周期与运行策略测试 |
| `npm run storage:status` | 本机存储状态 |
| `npm run storage:backup -- --critical` | 使用已配置的本机 restic 创建保护备份 |

测试、规则模拟与实际页面观察分别记录于 [交付验证报告](docs/OPEN-CIVILIZATION-VERIFICATION.md)。报告中的历史数字不代表以后每次提交都已重新验证。

## 目录

- `convex/civilization/`：规则、人物、地形、经济、制度、行动、存档与测试。
- `convex/civilization.ts`：文明查询、控制和持久化入口。
- `src/civilization/`：像素世界、工作台与观察面板。
- `scripts/`：Windows 启停、备份、维护与验证脚本。
- `docs/`：设计、使用说明、历史交付与限制。
- `tasks/`：阶段计划和未完成工作。

## 管理、开发与历史回退

具体操作见 [开发与回退指南](docs/DEVELOPMENT.md)。日常从 `main` 创建功能分支，修改后验证并提交，通过 PR 合并。当前完整本地实现作为一个导入基线保存；这不能补造此前未提交改动的逐步开发历史，上游历史仍保留。

**Git 管代码，独立备份管世界数据。** `.convex/`、`.runtime/`、依赖、模型、密钥和本机恢复凭据不上传。克隆仓库不会自动得到这台电脑上的世界。存档结构变化后，恢复旧版本须同时恢复匹配的数据，不能仅退代码。

## 文档与来源

[最新交付与限制](docs/OPEN-CIVILIZATION-VERIFICATION.md) · [文明使用说明](docs/CIVILIZATION.md) · [Windows 运行](WINDOWS.md) · [存储维护](docs/DATABASE-STORAGE.md) · [后续任务](tasks/todo.md) · [上游说明存档](docs/UPSTREAM-README.md)

遵循仓库现有 LICENSE；素材来源与授权说明保留在上游说明中。此项目的本地配置路径、测试世界 ID 和历史性能数字仅是原开发环境记录。

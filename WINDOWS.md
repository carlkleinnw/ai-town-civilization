# Windows 原生运行

2026-10-27 运行与存储治理已实现，当前说明见 [本轮验证](./docs/RUNTIME-STORAGE-VERIFICATION.md)。启动器显示阶段与耗时，按库大小设置等待预算（120 秒起、最多 900 秒，可用原环境变量覆盖）；超时不是性能优化本身。通过完整隔离校验后的官方恢复，本机实际启动由约 275 秒降为约 6.4 秒，后续仍需观察技术版本增长。重复启动不会覆盖现有进程与计时；失败窗口可按 R 重试或 Q 退出。停止服务前保存已发生的时钟预算，重启后保持暂停、需手动继续。

本机“运行与存储”入口：`http://127.0.0.1:5173/ai-town/workbench/?world=mh7fm2xg8twftrfgzsvkk9bfvh8h1wn4&tab=runtime`。显示独立的启动、页面、服务在线、模拟推进计时，数据库/配套文件/日志/备份、真实趋势、提醒阈值、保留策略预览与正式删除。新配置 `storage-policy.json` 和 `storage-protected-backups.json` 随备份保留。技术回收参数通过 `.env.windows.local` 传入，本次固定为六小时文档窗口、四分钟索引窗口和两秒批间隔；精确业务历史不因此删除。

2026-10-26 历史记录：专属文明世界修正时入口和原生运行方式不变；旧聊天小镇顶部可返回文明工作台/文明世界。当时将后端等待设为 120 秒；现已被上方分阶段等待策略替代。验收与演示见 [专属世界说明](./docs/CIVILIZATION-WORLD.md)。

本项目已增加 Windows 本地启动入口。前端使用 Windows Node.js，后端使用 Convex 官方 Windows 可执行程序，数据库使用项目目录里的 SQLite，模型通过 Windows Ollama 调用。无需 WSL、Docker 或 Convex 云账号。

2026-10-26 更新：默认打开“AI 人类文明演化模拟器”，原聊天小镇通过右上角入口保留。文明模式详见 [使用说明](./docs/CIVILIZATION.md) 与 [验证报告](./docs/CIVILIZATION-VERIFICATION.md)。命令行使用相对路径启动时，停止器增加本项目两项子进程的身份核对；不会仅凭相对路径停止别的项目。

## 启动和停止

1. 确保 Windows 的 Ollama 应用正在运行。
2. 双击项目根目录的 `Start-AI-Town.cmd`。
3. 启动完成后会打开 <http://127.0.0.1:5173/ai-town/>。

启动窗口需保持运行。按 `Ctrl+C` 或双击 `Stop-AI-Town.cmd` 可停止小镇的前后端；停止脚本只处理经过进程身份核对的本项目启动器。已经单独运行的 Ollama 服务会保留。

也可以在项目目录执行：

```powershell
npm run dev:windows
```

首次安装依赖时，先检查目标盘空间，然后执行：

```powershell
npm ci --cache E:\DeveloperCache\npm --no-audit --no-fund
```

当前电脑已安装依赖，可直接启动。启动器会检查 Ollama 服务及模型是否存在，缺少模型时会提示，不会自动下载大模型。

## 本地模型

当前配置复用电脑上已有的模型，名称在 `.env.defaults` 中：

| 用途 | 模型 |
| --- | --- |
| 角色聊天、摘要 | `qwen3.5:4b` |
| 记忆向量 | `embeddinggemma:300m`，768 维 |

`OLLAMA_REASONING_EFFORT=none` 关闭本地聊天模型的思考过程，避免项目的短回复额度被思考消耗，出现空回复。这个参数只发给 Ollama。

向量索引维度在 `convex/util/llm.ts` 中设为 768，与当前模型一致。更换向量模型时，需要同时匹配索引维度；已有记忆不能直接混用不同模型的向量。供应商检查已经按模型供应商判断，避免将同样使用 768 维的 Ollama 误认成 Together。

启动器只连接 `.env.local` 中的匿名本地部署 `http://127.0.0.1:3210`，不会切换到云端部署。`.env.defaults` 中的设置会写入该本地后端。该文件是本地模型配置，请勿在其中存放 API 密钥。

## 文件位置

| 内容 | 当前电脑路径 |
| --- | --- |
| 项目与依赖 | `E:\AI_town\ai-town` |
| 模型 | `E:\Ollama\models`，沿用已有 Ollama 配置 |
| 数据库与世界状态 | `E:\AI_town\ai-town\.convex\local\default` |
| 后端程序与管理面板缓存 | `E:\AI_town\ai-town\.runtime\local-app-data\convex` |
| Convex 下载临时目录 | `E:\AI_town\ai-town\.runtime\temp` |
| npm 缓存 | `E:\DeveloperCache\npm` |

Convex CLI 的少量匿名部署身份信息由软件保存在 Windows 用户目录下的 `.convex`；主要程序、模型和数据库保存在 E 盘。启动器的缓存路径设置只作用于它启动的进程，不修改系统环境变量。

## 验证与限制

- 2026 年 10 月 25 日本机验证：56 项测试通过，类型检查和构建通过，代码检查为 0 错误、96 条警告。
- Windows Edge 独立测试浏览器验证了地图渲染、玩家进入、接受 AI 邀请、收到 AI 消息与退出；未发现页面脚本错误或 HTTP 资源加载失败。检查时数据库已有 31 条非空消息和 3 条记忆。
- 已验证停止、再次启动和世界数据保留；在开发服务运行期间执行构建也能保持服务正常。Vite 已跳过构建输出、数据库和运行缓存，避免 Windows 文件占用导致的监视错误。
- 当前电脑使用 Windows、Node.js `24.21.0`、npm `11.19.0` 和已有的 Windows Ollama。
- 测试命令已改为 Windows 与其他平台都能执行的写法：`npm test -- --runInBand`。
- `npm run build` 检查类型并构建网页；`npm run lint` 检查代码。
- 原项目的登录功能仍处于关闭状态，所有人类玩家共用 `Me` 身份，适用于单机体验。
- 主界面支持中文 / English 切换，默认显示中文；AI 新回复跟随语言设置。已有聊天保留原文，详见 [中文兼容说明](./LOCALIZATION.md)。
- 首次下载 Convex 程序和依赖需要联网。Convex 本地部署仍可能连接官方更新、遥测和错误报告服务；角色推理和世界数据由本机服务处理。
- 本地开发部署会暴露调试信息，后端默认监听网络接口；请用于本机开发体验，不要将它作为公网部署入口。

官方资料：[Convex 本地部署](https://docs.convex.dev/cli/local-deployments)、[官方后端与 Windows 说明](https://github.com/get-convex/convex-backend)、[Ollama 接口兼容说明](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx)。

## 全屏世界与独立工作台（本轮更新）

启动地址不变。`/ai-town/` 显示像素世界，`/ai-town/workbench/` 可独立刷新访问；原聊天小镇为 `/ai-town/?view=town`。正常速度默认 1×，现实 120 秒/模拟天，可在工作台设置。后端停止或电脑休眠期间不补算离线时间。停止/重启会保留日内小时、倍率、本位日长和存档。

本轮复用了现有依赖和 Ollama，没有安装、下载或引入付费服务。主要数据、备份和浏览器证据继续留在 E 盘。

# 开发与回退指南

## 日常开发

```powershell
git switch main
git pull --ff-only
git switch -c feature/your-change
# 修改并执行 README 中相应验证
git add <明确修改的文件>
git commit -m "feat: describe the change"
git push -u origin HEAD
```

在 GitHub 创建 PR，说明行为变化、验证和限制，再合并 main。小步提交；不要把多个无关任务挤进一个提交。不要提交环境密钥、本机数据库、运行日志或备份密码。

## 查看和撤销

```powershell
git log --oneline --decorate --graph -20
git diff
git show <commit>
# 已共享的错误提交，用一个新提交撤销，保留历史
git revert <commit>
```

有未保存工作先提交到自己的分支，或使用 `git stash push -u`；不要直接覆盖。多个连续提交的回退需逐项确认依赖，不能随意硬重置或强推共享分支。

## 查看旧版本

```powershell
# 在独立目录检出，不覆盖当前工作区
git worktree add ../ai-town-old <tag-or-commit>
```

旧版本与当前版本不能同时使用同一 `.convex` 数据目录。仅看代码无需启动；要运行旧版本，先在独立路径恢复与该版本匹配的数据和配置。

## 代码和存档同时回退

1. 使用停止器保存并停止服务。
2. 用已配置的完整备份保留当前源码、配置和数据库；确认备份成功，勿删除当前恢复点。
3. 从目标备份将配套源码和完整 `.convex` 恢复到另一个目录；不要混合不同备份的 SQLite 主库与 WAL。
4. 检查恢复点、必要密钥及模型配置后，再独立启动并核对世界、人物和历史。

命名文明存档与分支在应用中管理，不能被代码 Git 标签代替。详见 DATABASE-STORAGE.md。restic 工具、仓库和密码文件需要在新机器单独配置，克隆代码不会自动拥有备份能力。

## 版本节点

`v0.1.0-local-baseline` 标记首次上传的本地文明实现基线，不表示完整文明模拟目标已经完成。后续稳定交付增加新标签，避免移动旧标签。

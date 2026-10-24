# 提交检查清单（2026-11-18）

> 功能冻结：2026-11-14。**在 11/14 冻结之前不要创建 `submission-2026-11-18` 标签**，
> 也不要为了打标签提前冻结功能；标签应在冻结后、提交前由负责人统一创建。

## 当前状态（2026-10-24）

- 分支：`feat/qingchuan-implementation`（最新提交见 `git log -1`）；未合并、未推送（暂无 remote）、未建 tag。
- 质量门：`npm run lint` 0 error（1 个 `<img>` warning）、`typecheck`、`build` 通过；
  `npm test` **265 tests / 34 files** 全绿；Playwright E2E **3/3**。
- 真实评测（`data/eval/results.json`，2026-10-24）：
  - RAG Recall@5 **1.00**（35/35）
  - Agent **4/4（100%）**，单次真实运行，平均约 21.9 秒
  - 检测 **P 0.78 / R 0.50 / F1 0.61**（10 张 NOAA 单目标裁片、人工 GT、IoU ≥ 0.5）
- 已实现并实测：确定性编排、VLM/检索/报告/Verifier、低置信复核 → 重新生成 → 导出闭环、
  报告页复核入口与三向证据联动、日预算/限流/图片上限、原子 analyze claim、
  注入透传与规则化审核、流水线步骤审计、演示数据“人工构造”标注。
- 已知局限（必须在视频/PDF 中如实说明）：
  - 检测评测是小样本自查（10 张单目标裁片、人工粗框），不是大规模基准；
  - Agent 评测是单次运行，模型输出有随机性；
  - `sample-3.jpg` 目前是 NOAA 图库的 220×220 缩略图；
  - 当前没有在线演示地址，仓库还没有公开 remote。

## 仓库与文档

- [ ] GitHub/Gitee 仓库公开，README 完整（介绍、架构、运行、命令、部署、评测、隐私、团队、License）
- [x] `LICENSE`（MIT）存在，README 的 License 段指向该文件
- [x] `.env.example` 存在且只有空值；`git ls-files` 只包含 `.env.example`
- [x] `.env.local` 未进入 Git；`git grep -nE "sk-[A-Za-z0-9]{16,}"` 在跟踪代码中无命中
- [x] Git 历史为逐功能/逐修复提交，提交信息可读
- [ ] 5–8 分钟 1080p 视频（普通话），覆盖问题、架构、实机演示、指标与社会价值
- [ ] ≤30 页 PDF 技术文档（含 AI 选型、集成、优化、创新点、评测、部署）
- [ ] README 中的团队信息、截图、演示地址已替换占位内容（团队表当前仍为“待补充”）

## 功能与质量

- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 全部通过
- [x] E2E：`npm run test:e2e` 3/3 通过（巡检上传/分析、报告页、导出闸门、复核与重新生成接线）
- [ ] 生产构建后手工走通完整 UI：上传 → 计划 → SSE 分析 → 证据链 → 复核纠错 → 报告 → PDF 导出
- [ ] Lighthouse（桌面 + 移动）在最终构建上重跑并记录（历史结果 0.97 / 1.00，需复测）
- [x] 限流、预算上限、提示注入防御、文件类型/大小校验有单测/实测覆盖
- [x] 错误路径有中文提示；失败/重试不重复计费有回归测试

## 部署与运维

- [ ] 在线演示地址可用，免登录可用，HTTPS 正常
- [ ] PM2 单实例运行，`NODE_ENV=production`、`DATA_DIR` 指向持久化目录
- [ ] Nginx 配置包含 20m 请求体、SSE 关闭缓冲、`proxy_read_timeout 300s`、`X-Forwarded-For`
- [ ] 服务器保留到 2027 年 2 月，覆盖评审期
- [ ] 每日 SQLite + 上传目录备份已生效，并做过一次恢复演练
- [ ] MCP stdio 命令可用：`npx tsx scripts/run-mcp.ts`（或 `npm run mcp`）

## 数据与合规

- [x] 样例图片许可证与来源已记录在 `public/samples/README.md`（三张均为 NOAA 公有领域）
- [x] 样例图无清晰人脸/车牌；EXIF/GPS 已剥离
- [x] 演示数据由 `npm run seed` 生成；报告标注 `source: manual`，不是实时 AI 输出
- [x] 隐私说明与实际数据流一致（图片仅在分析时发送到云端 API）

## 评测

- [x] 检测评测使用真实人工 GT，按 IoU ≥ 0.5 匹配后报告 P/R/F1
- [x] 未把 dry-run 结果或原始检出数当作效果证据
- [x] `data/eval/results.json` 由真实评测脚本生成，并写入 README 与 `/eval` 页面
- [x] 评测日期、模型名、Prompt 版本已在 README/results 中记录
- [ ] 视频/PDF 中的评测表述与 README 一致，并明确“小样本/单次运行”局限

## 发布

- [ ] 功能冻结（11/14）后再创建 `submission-2026-11-18` 标签
- [ ] 打标签前从干净工作区重新执行完整验证（lint/typecheck/test/build/E2E + 一次真实冒烟）
- [ ] 提交视频、PDF、演示地址与仓库链接
- [ ] 赛后在控制台轮换 DeepSeek / DashScope API key

## 常用命令

```bash
cd C:\Users\29532\Desktop\qingchuan
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e
npm run db:push && npm run ingest && npm run seed
npm run eval:rag && npm run eval:agent && npm run eval:detection
```

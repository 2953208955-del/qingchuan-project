# 清川 · 河湖垃圾多模态巡检 Agent

清川是一个 AI Native 的河湖垃圾巡检 Web 应用。巡查人员上传手机或无人机照片、用一句话说明任务，Agent 自动完成识别分类、计数与严重度评估、标准条款溯源、巡检报告生成、人工复核与 PDF 导出。

每条结论都可以追溯到原图识别框和对应的标准条款，目标是让基层河长、河道保洁员和环保志愿者"拍照即巡检"。

## 文档

- [设计文档](docs/superpowers/specs/2026-10-22-qingchuan-design.md)
- [实施计划](docs/superpowers/plans/2026-10-22-qingchuan.md)

## 技术栈

Next.js 15（App Router）、React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui、Zustand、TanStack Query、Vercel AI SDK、Drizzle ORM、better-sqlite3、Zod、Vitest、Playwright。

所有 AI 推理均调用云端 API，本地只需 Node.js 与 SQLite 文件，不需要 GPU、Docker 或 WSL。

## 本地开发

要求 Node.js >= 20、npm。

```bash
npm install
cp .env.example .env.local
# 在 .env.local 中填入 API Key
npm run dev
```

打开 http://localhost:3000。

## 常用命令

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

密钥只放在 `.env.local`，不得提交到 Git。

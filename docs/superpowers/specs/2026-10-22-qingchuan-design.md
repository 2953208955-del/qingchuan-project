# 清川 · 河湖垃圾多模态巡检 Agent — 设计文档

- 日期：2026-10-22
- 状态：待团队评审
- 赛事：全国高校 AI Web 开发挑战赛（省赛作品提交截止 2026-11-18）
- 项目仓库：`C:\Users\29532\projects\qingchuan`（本地 Git，后续推送 GitHub/Gitee）

---

## 1. 项目概述

**清川**是一个 AI Native 的河湖垃圾巡检 Web 应用。巡查人员上传手机或无人机照片、用一句话说明任务，Agent 自动完成：

> 识别分类 → 计数与严重度评估 → 标准条款溯源 → 巡检报告生成 → 人工复核 → PDF 导出

每条结论都可以追溯到**原图识别框**和**对应的标准条款**。目标用户是基层河长、河道保洁员、环保志愿者等非专业人员，核心价值是"拍照即巡检"：把原本需要专业培训和人工整理的流程压缩成一次对话。

### 1.1 设计原则

1. **数字由代码计算**：计数、检出强度、严重度分级全部由确定性代码完成，LLM 只负责组织语言和引用标准。
2. **无证据不结论**：报告中的每条结论必须绑定证据 ID，Verifier 不通过不得导出。
3. **无依据不回答**：RAG 检索不到相关条款时明确拒答，不编造标准。
4. **低置信必须复核**：低置信度识别项进入人工复核队列，确认后才能生成最终报告。
5. **可量化评测**：检测按 GT 匹配后的 P/R/F1 评估，不以原始检出数或单个演示样例证明效果。
6. **本机可跑、无需 GPU**：所有模型推理走云端 API；本地只需 Node.js + SQLite 文件，不需要 GPU、Docker、WSL 或本地模型。

---

## 2. 目标与非目标

### 2.1 目标

- 4 周内交付一个可公网访问、可完整演示的 Web 应用。
- 覆盖评分表中六项 AI 子维度：LLM 集成、Agent/工作流、RAG、多模态、AI 安全、MCP/工具集成。
- 形成真实巡检闭环：上传 → 分析 → 复核 → 报告 → 导出。
- 产出可复现的量化评测结果，写入技术文档与演示视频。

### 2.2 非目标（明确不做）

- 不训练或微调检测模型。
- 不做本地 GPU / 本地大模型 / 端侧推理。
- 不做多租户、权限体系、支付。
- 不做复杂 GIS 或真实工单系统对接（工单与地图为 mock，界面明确标注）。
- 不承诺物理意义上的"垃圾密度（个/平方米）"；无标定面积时只用"检出强度（个/图）"。

---

## 3. 用户与场景

| 角色 | 需求 | 使用方式 |
|---|---|---|
| 基层河长 / 河道保洁员 | 快速记录问题、生成上报材料 | 手机 Web，拍照 + 语音 |
| 环保志愿者 / 学生社团 | 低门槛参与巡河、形成活动记录 | 上传相册照片，一键生成报告 |
| 水务 / 城管部门（次要） | 汇总河段问题、追踪整改 | 报告库、按河段/时间筛选 |
| 评委 | 无需准备素材即可体验 | 免登录演示账号 + 内置样例数据 |

### 3.1 核心场景

1. **单次巡河**：上传 5–20 张照片，Agent 识别垃圾类别与数量，给出严重度，生成巡河记录。
2. **标准问答**：询问"塑料瓶属于哪类问题、依据什么标准"，返回条款原文与出处。
3. **周期报告**：按河段/时间汇总多次巡检，生成周报/月报与热点提示（加分项）。
4. **整改闭环**：生成整改建议与优先级，导出报告或创建 mock 工单。

---

## 4. 核心流程

```
上传图片/语音指令
      │
      ▼
[Intake] 解析意图与范围（可修改）
      │
      ▼
[Plan] 生成执行计划 → 用户确认（图片数/重点类别/预计耗时与费用）
      │
      ▼
[Analyze] 逐图并行识别（VLM，结构化输出）
      │
      ▼
[Aggregate] 代码去重、计数、检出强度、严重度分级
      │
      ▼
[Retrieve] RAG 检索标准条款（混合检索 + rerank）
      │
      ▼
[Draft] 生成结构化报告（只能引用 evidence ID）
      │
      ▼
[Verify] 校验证据、数字、引用；不通过则回修
      │
      ▼
[Review] 人工复核低置信项 / 纠错
      │
      ▼
[Export] 导出 PDF / 创建 mock 工单
```

---

## 5. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器（Next.js 15 / React 19 / TS）                         │
│  上传与压缩 │ 语音输入 │ Agent 时间线 │ 证据面板 │ 报告编辑器   │
│  SSE 流式接收 │ Zustand 本地状态 │ TanStack Query 服务端状态   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / SSE
┌──────────────────────────▼──────────────────────────────────┐
│ Next.js Route Handlers（Node runtime）                      │
│  Agent 编排状态机（TypeScript，非黑盒框架）                   │
│  工具层：analyzeImage / searchStandards / computeSeverity    │
│          / draftReport / verifyReport / createWorkOrder      │
│  安全网关（内容审核、注入检测、参数校验、预算控制）             │
│  审计日志（每一步的模型、Prompt 版本、耗时、费用）              │
│  MCP Server（复用同一套工具）                                 │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────────────┐
│ SQLite 文件库  │  │ 本地文件存储   │  │ 云端模型 API           │
│ 知识库/切片    │  │ 上传图片/报告  │  │ DeepSeek（文本）       │
│ 运行记录/证据  │  │               │  │ Qwen-VL（视觉）        │
│ 评测结果      │  │               │  │ Qwen-Embedding/Rerank │
└───────────────┘  └───────────────┘  └───────────────────────┘
```

**关键约束**：本地与服务端均不需要 GPU；所有推理在云端 API 完成。SQLite 为单文件数据库，知识库规模预期 < 5,000 切片，向量检索在 Node 进程内用余弦相似度完成，无需向量数据库。

---

## 6. Agent 设计

### 6.1 编排方式

采用**确定性状态机 + LLM 决策点**，而不是完全自主 Agent。原因：可复现、可审计、成本可控，且能保留规划、工具调用、自主决策与自我校验等评分点。

状态：

```
idle → planned → analyzing → aggregating → retrieving
     → drafting → verifying → awaiting_review → exported
                         ↘ failed（记录失败步骤，可重试）
```

- 每个步骤写入 `agent_steps` 表，包含输入、输出、耗时、费用、错误。
- 支持从失败步骤重试，已完成步骤不重复计费。
- 图片分析并发上限 4，单图超时 60s，失败重试 1 次。

### 6.2 角色分工

| 角色 | 职责 | 实现 |
|---|---|---|
| Intake Agent | 把自然语言指令解析为结构化任务（范围、重点类别、输出要求） | LLM + Zod |
| Planner | 生成可读的执行计划，供用户确认 | LLM（低成本模型即可） |
| Vision Agent | 逐图识别：类别、材质、置信度、bbox、描述 | VLM + Schema 校验 |
| Aggregator | 去重、计数、检出强度、严重度 | 纯代码 |
| Retrieval Agent | 查询改写、混合检索、rerank | 代码 + Embedding/Rerank API |
| Reporter | 生成结构化报告，只能引用 evidence ID | LLM |
| Verifier | 校验证据存在、数字一致、引用真实；不通过列出问题 | 代码 + LLM 辅助 |
| Safety Guard | 输入/输出审核、注入检测、拒答 | 代码 + 模型审核 |

### 6.3 工具契约

所有工具使用 Zod 定义输入输出，服务端执行，客户端只看到流式状态与结果摘要。

```ts
analyzeImage(input: {
  imageId: string
  focusCategories?: DebrisCategory[]
  userHint?: string          // 人工纠错时传入
}): Promise<{
  detections: Detection[]    // 含 bbox、category、material、confidence、description
  abstained: boolean
  reason?: string
}>

computeSeverity(input: {
  detections: Detection[]
  imageCount: number
}): Promise<{
  perImage: ImageSeverity[]
  overall: 'low' | 'medium' | 'high'
  formulaVersion: string
}>

searchStandards(input: {
  query: string
  categories?: DebrisCategory[]
  topK?: number
}): Promise<{
  clauses: Clause[]          // 含 standardNo、clauseNo、content、score
  noEvidence: boolean
}>

draftReport(input: {
  runId: string
  context: InspectionContext
  clauses: Clause[]
}): Promise<ReportDraft>      // 每条结论带 evidenceIds

verifyReport(input: {
  report: ReportDraft
  evidenceIndex: EvidenceIndex
}): Promise<{
  passed: boolean
  issues: { type: string; message: string; evidenceId?: string }[]
}>

createWorkOrder(input: {
  runId: string
  severity: Severity
  location?: string
}): Promise<{ ticketId: string; mock: true }>
```

### 6.4 人工复核与纠错

- 复核队列按置信度升序排列，低置信项必须处理。
- 支持四种操作：确认、删除、改类别、框选修正。
- "自然语言纠错"：用户输入"这是塑料袋，不是水草"，仅对该图重跑并携带提示。
- 纠错记录写入 `feedback` 表，进入后续评测集与 Prompt 优化。

### 6.5 严重度规则（代码实现，版本化）

- 单类权重：渔网渔具 1.5；塑料（瓶/袋/泡沫）1.2；玻璃/金属 1.1；纸/织物/其他 1.0；自然漂浮物（水草、树叶）0（默认排除，可在指令中要求包含）。
- 加权检出量 `W = Σ(类别权重 × 数量)`；检出强度 `I = W / 图片数`。
- 分级：`I < 2` 低；`2 ≤ I < 5` 中；`I ≥ 5` 高。
- 一票升级：出现渔网渔具、玻璃、金属等风险类别，或单类数量 ≥ 10，至少为"中"。
- 若有河段长度，可另算"每公里加权检出量"，仅作参考。
- 公式版本写入 `computeSeverity` 输出与报告；无面积标定时不输出"个/平方米"。

---

## 7. 大模型选型与集成

### 7.1 模型路由

| 能力 | 主选 | 备选 | 用途 |
|---|---|---|---|
| 文本规划/报告/校验 | DeepSeek Chat | Qwen-Max | 规划、报告、Verifier 辅助 |
| 视觉理解与定位 | Qwen3-VL Plus（DashScope） | GLM-4V | 识别、分类、bbox、描述 |
| 文本向量 | Qwen3.7 text-embedding | BGE-M3（API） | 知识库切片与查询 |
| 重排 | Qwen3.7 text-rerank | LLM rerank | 候选条款重排 |
| 内容审核 | 规则 + LLM 轻量审核 | 云内容安全 API | 输入输出安全 |

第 1 周用 20 张公开图片对比 Qwen-VL 与 GLM-4V 的识别一致性、计数误差、bbox 质量、延迟与费用，用数据确定主备。

### 7.2 集成质量措施

- 所有结构化输出走 JSON Schema + Zod 校验；失败重试 1 次，仍失败则降级为"无法判定"。
- Prompt 存放于 `prompts/`，带版本号、模型参数与对应评测用例；运行记录写入 `prompt_version`。
- 模型调用统一封装，支持 OpenAI-compatible 接口，供应商可替换。
- 按图片 SHA-256 缓存识别结果；缓存键包含模型名与 Prompt 版本。
- 单次运行设置 token/费用预算（默认 ¥1），超限暂停并提示。
- 客户端压缩图片（长边 1600px、WebP）后再上传，降低延迟与费用。

---

## 8. RAG 设计

### 8.1 知识库语料

- 公开的海洋/河道垃圾监测技术规程、地表水环境评价规范、河长制与河道保洁政策。
- 团队编写的巡检 SOP、类别定义、严重度分级规则、报告模板（原创）。
- 每条语料记录来源、标准号、版本/生效日期；技术文档中逐条核对现行有效性。

### 8.2 入库与检索

```
PDF/DOCX/网页 → 结构解析 → 按"章/条"切分（300–500 字，重叠 10–15%）
→ 写元数据（standard_no / clause_no / page / category_tags）
→ Embedding API → 存入 SQLite（JSON 向量）
```

- 查询改写：用 LLM 扩展同义词（塑料瓶 / 饮料瓶 / PET），保留原始查询。
- 召回：向量余弦相似度 top 20 + 关键词匹配（SQLite FTS5）合并去重。
- 重排：调用 rerank API 取 top 5；低于阈值判定"无依据"。
- 生成：强制引用 `[标准号 第X条]`，并附原文摘录；无依据时明确拒答。

### 8.3 规模与扩展

预期切片数 < 5,000，进程内余弦检索即可满足演示与评测；接口层预留向量库适配器，规模化时可切换到 pgvector / Milvus，无需改业务代码。

---

## 9. 多模态设计

| 模态 | 输入/输出 | 实现 |
|---|---|---|
| 图像 | 上传照片、无人机图 | 压缩 → 云端 VLM → 结构化识别 |
| 文本 | 自然语言指令、标准条款 | LLM + RAG |
| 语音 | 现场语音指令 | Web Speech API；不支持时降级为文本 |
| 视频（加分） | 无人机/手机视频 | 浏览器按时间或场景变化抽帧 → 同一管线 |

- 统一 `InspectionContext`：图片列表、时间、位置、用户意图、重点类别、检索条款。
- 输出：标注图（bbox + 类别 + 置信度）、类别统计图、严重度、报告。
- 所有模态结果都汇入同一证据索引，供报告与 UI 双向跳转。

---

## 10. AI 安全与可控性

1. **证据链约束**：Reporter 输出的每条结论必须引用存在的 evidence ID；Verifier 校验失败则回修，最多 2 轮，仍失败则标记"需人工补充"。
2. **数字不由 LLM 生成**：Aggregator 输出结构化数字，Verifier 比对报告中的数字与 Aggregator 结果。
3. **视觉提示注入防御**：图片中可能包含"忽略以上指令"等文字；系统提示明确把 OCR/图中文字视为不可信数据，工具白名单 + Schema 校验 + 不执行图片中的任何指令。
4. **内容审核**：输入图片与文本先过审核；输出报告过滤敏感/不当内容。
5. **置信度分级**：高 ≥ 0.8，中 0.5–0.8，低 < 0.5；低置信必须人工复核。
6. **拒答机制**：识别不确定时返回"无法判定"，RAG 无依据时明确说明。
7. **隐私**：上传图片按原始字节保存，服务端不剥离 EXIF；用户须在上传前自行移除 EXIF/GPS 等元数据；演示数据不长期留存；上传图片默认仅用于本次任务；提供隐私说明。
8. **审计**：记录模型、Prompt 版本、工具调用、耗时、费用，支持复现。

---

## 11. MCP / 工具集成

- 应用内通过 Function Calling 调用工具；同一套工具通过 `@modelcontextprotocol/sdk` 暴露为 MCP Server。
- MCP 工具：`analyze_image`、`search_standards`、`compute_severity`、`create_work_order`、`get_river_profile`。
- 演示时用 MCP 客户端（如 Claude Desktop）直接调用，证明协议层集成真实可用。
- 安全：工具参数 Zod 校验、白名单、单次调用超时、限流；工单/河段信息为 mock 并明确标注。

---

## 12. 前端设计

### 12.1 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui（Radix）
- Zustand（工作台交互状态）+ TanStack Query（服务端状态与缓存）
- Vercel AI SDK（`ai`、`@ai-sdk/react`、`@ai-sdk/openai-compatible`）流式与工具调用
- Zod（前后端共享类型）、Drizzle ORM + SQLite（better-sqlite3）
- Recharts（统计图）、`motion`（动画）
- Vitest + Playwright + MSW

### 12.2 页面

| 路由 | 内容 |
|---|---|
| `/` | 落地页：价值主张、架构亮点、进入示例巡检 |
| `/inspect` | 核心工作台（三栏：输入 / Agent 时间线 / 证据与报告） |
| `/reports` | 报告库：按河段/时间筛选、历史版本 |
| `/reports/[id]` | 报告查看、编辑、复核、导出、历史版本 |
| `/knowledge` | 知识库浏览、条款检索控制台 |
| `/eval` | 评测看板：检测 P/R/F1、RAG Recall@5、Agent 成功率（加分） |

### 12.3 工作台布局

```
┌──────────────────────────────────────────────────────────────┐
│ 清川   巡检工作台   报告库   知识库   评测                     │
├──────────────┬───────────────────────────┬───────────────────┤
│ ① 输入        │ ② Agent 时间线             │ ③ 证据 / 报告      │
│ 上传 / 样例   │ ✓ 解析指令 0.4s            │ [原图 + 识别框]     │
│ 🎙 语音       │ ● 识别 3/12 张…            │ 类别 / 置信度      │
│ 位置 / 时间   │ → analyzeImage ×12        │ [证据] [纠错]      │
│ [开始巡检]    │ ✓ 汇总：检出强度 中度      │ 严重度：中度        │
│              │ ✓ 检索标准 [3 条]          │ [生成报告]         │
│              │ ⟳ 生成报告…                │ [导出 PDF]         │
└──────────────┴───────────────────────────┴───────────────────┘
```

移动端改为"上传 → 分析 → 报告"三步向导，适配现场拍照。

### 12.4 核心交互

1. **证据链双向跳转**：报告结论 ↔ 原图识别框 ↔ 标准条款，三向高亮联动。
2. **计划确认环节**：开跑前展示图片数、重点类别、预计耗时与费用，用户可修改范围。
3. **自然语言纠错**：对单张图追加提示重跑，记录反馈。
4. **Agent 时间线**：每步显示工具名、输入输出摘要、耗时、费用，可展开原始 JSON。
5. **流式报告**：分段渲染，引用逐步落位，骨架屏与进度可视化。
6. **错误隔离**：单图失败不拖垮整次巡检；AI 不可用时降级为手动标注模式，仍可出报告。

### 12.5 视觉方向

"水文 + 环保"气质：深青绿主色、沙色中性底、琥珀色警示（低置信/需复核）；数据密集但克制，不使用泛滥的紫蓝 AI 渐变。支持深色模式、响应式、键盘导航、`prefers-reduced-motion`，对比度达 WCAG AA。

### 12.6 前端工程质量

- TypeScript strict，禁止隐式 `any`；Zod schema 推导前后端共享类型。
- 组件分层：`ui`（基础）、`inspection`（业务）、`layout`；容器与展示分离。
- 每个异步界面具备 loading / empty / error 三态；全局与局部 Error Boundary。
- 路由级代码分割；PDF 预览与报告编辑器动态导入；中文使用系统字体。
- 图片列表虚拟化；上传前压缩；样例结果按 hash 缓存。
- 性能目标：LCP < 2.5s、CLS < 0.1、INP < 200ms、Lighthouse ≥ 90。
- 单测：严重度计算、证据校验、切片与检索、费用计算；E2E：上传 → 分析（mock）→ 报告 → 导出。

### 12.7 报告导出

- MVP：打印优化页面 + 浏览器"另存为 PDF"，避免中文字体嵌入问题。
- 加分：服务端 `@react-pdf/renderer` + 中文子集字体，实现一键下载。
- 报告包含：标题、时间地点、方法说明、分类结果、严重度、证据附录（图 + 框 + 条款）、局限性、模型与 Prompt 版本、复核人。

---

## 13. 数据模型（SQLite）

```sql
documents(id, title, source, standard_no, version, effective_date, file_path, created_at)
chunks(id, document_id, clause_no, page, content, category_tags, embedding_json, created_at)
runs(id, status, instruction, location, created_at, updated_at, prompt_version,
     model_config_json, total_cost, error)
images(id, run_id, filename, path, sha256, width, height, exif_json, status)
detections(id, run_id, image_id, category, material, confidence, bbox_json,
           description, source, review_status, created_at)
evidence(id, run_id, type, ref_id, label, created_at)
reports(id, run_id, version, content_json, status, created_at)
agent_steps(id, run_id, step, status, tool_name, input_json, output_json,
            latency_ms, cost, error, started_at, finished_at)
feedback(id, run_id, detection_id, correction_json, created_at)
evaluations(id, dataset, metrics_json, created_at)
```

- 文件存储：`data/uploads/`、`data/reports/`；数据库 `data/qingchuan.db`。
- 所有路径使用相对路径，环境变量 `DATA_DIR` 可覆盖。

---

## 14. API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/uploads` | 上传图片（校验类型/大小，压缩，落盘） |
| POST | `/api/runs` | 创建巡检任务 |
| POST | `/api/runs/[id]/plan` | 生成计划（SSE） |
| POST | `/api/runs/[id]/analyze` | 执行分析流水线（SSE） |
| GET | `/api/runs/[id]` | 任务状态与结果 |
| PATCH | `/api/detections/[id]` | 复核/纠错 |
| POST | `/api/runs/[id]/report` | 生成与校验报告 |
| GET | `/api/reports/[id]/print` | 打印优化页面 |
| POST | `/api/knowledge/search` | 条款检索 |
| GET | `/api/eval/summary` | 评测结果 |
| POST | `/api/tools/[tool]` | 工具调用（供 MCP/内部复用） |
| POST | `/api/mcp` | MCP Streamable HTTP 端点（或独立 stdio 进程） |

- 所有 API 服务端执行模型调用，密钥不出服务端。
- 统一错误结构 `{ code, message, retryable }`；SSE 事件包含 `step`、`status`、`detail`。
- 演示账号：免登录只读样例 + 可创建临时任务；限制单 IP 频率与每日预算。

---

## 15. 评测方案

### 15.1 数据集

- 检测评测：50–100 张公开数据集图片（TACO、FloW、TrashCan 等，确认许可证）+ 团队自拍河道图；使用公开标注或人工标注。
- RAG 评测：30–50 题金标准问答，覆盖类别定义、严重度、处置建议、标准条款。
- Agent 评测：20 个脚本化任务（正常、模糊、无依据、注入攻击、模型失败等）。

### 15.2 指标

| 维度 | 指标 |
|---|---|
| 检测 | GT 匹配（IoU ≥ 0.5）后的 Precision / Recall / F1、mAP；计数 MAE |
| RAG | Recall@5、引用准确率、答案忠实度（LLM 评审 + 人工抽检） |
| Agent | 任务成功率、工具调用准确率、平均耗时、单次成本 |
| 安全 | 注入攻击拦截率、无依据拒答率、低置信转人工率 |
| UX | 5 人可用性测试、SUS 评分 |

### 15.3 原则

- 不使用"原始检出数增加"作为改进证据；必须做 GT 匹配后看 P/R/F1。
- 每次 Prompt/模型变更前后跑同一评测集，记录版本与结果。
- 评测脚本纳入仓库，结果写入技术文档与 `/eval` 页面。

---

## 16. 部署与运行环境

### 16.1 本地开发（无 GPU / 无 Docker / 无 WSL）

- 依赖：Node.js ≥ 20、npm（或 pnpm）、现代浏览器（Chrome/Edge）。
- 步骤：`npm install` → 复制 `.env.example` 为 `.env.local` → `npm run db:push` → `npm run dev`。
- 数据库为 SQLite 单文件，无需安装数据库服务。
- 所有模型调用走云端 API；无 GPU、无本地模型权重。

### 16.2 环境变量

```bash
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
ZHIPU_API_KEY=            # 视觉备选
DATA_DIR=./data
APP_BASE_URL=http://localhost:3000
RUN_BUDGET_CNY=1.0
DAILY_BUDGET_CNY=20
```

### 16.3 公网演示（可选加分）

- 一台普通 Linux 云服务器（2C4G，无 GPU）：Node.js + PM2 + Nginx + SQLite 文件。
- 不使用 Docker 也可部署；提供 `deploy/` 脚本与说明。
- 服务保持到 2027 年 2 月，覆盖评审期；配置 Uptime 监控与每日备份。
- 备选：本机运行 + Cloudflare Tunnel（仅当服务器不可用时）。

---

## 17. 四周交付计划

| 阶段 | 日期 | 目标 | 里程碑 |
|---|---|---|---|
| 第 1 周 | 10/22–10/28 | 脚手架、设计系统、SQLite schema、图片上传与压缩、VLM 选型实验、RAG 入库 v1 | M1：上传 1 张图 → 识别 → 证据面板显示 |
| 第 2 周 | 10/29–11/4 | Agent 状态机与工具层、计划确认、多图流水线、严重度规则、证据链 v1、50 张评测集 | M2：多图全流程跑通至报告草稿 |
| 第 3 周 | 11/5–11/11 | 报告生成 + Verifier、人工复核/纠错、知识库页、安全防护、MCP Server、公网部署 | M3：功能完整并公网可用 |
| 第 4 周 | 11/12–11/18 | 11/14 功能冻结；评测与性能打磨；11/15–16 录视频；11/12–16 写文档；11/17 检查；11/18 提交 | M4：材料提交完成 |

**分工（3 人）**：A 前端与交互；B Agent/RAG/后端；C 数据、评测、文档与视频。
**1–2 人裁剪**：去掉语音、地图、视频抽帧、`/eval` 可视化页（评测数据仍写入文档），MCP 必须保留。

---

## 18. 提交材料清单

- 代码仓库：GitHub/Gitee 公开；README（介绍、架构、运行、团队）；`.env.example`；依赖清单；注释；**从项目第一天起的真实 Git 历史**。
- 演示视频：5–8 分钟、1080p、普通话；问题 → 架构 → 实机演示（上传、时间线、证据链、纠错、RAG、导出、MCP、评测）→ 指标 → 社会价值。
- 技术文档：≤ 30 页 PDF；项目概述、需求分析、架构、AI 技术方案（选型/集成/优化）、核心实现、测试与部署、量化评测、创新点、总结展望。
- 在线演示：公网地址 + 免登录体验账号（如需要）；保持服务至评审结束。
- 敏感信息：密钥仅环境变量；仓库只提交 `.env.example`。

---

## 19. 风险与对策

| 风险 | 对策 |
|---|---|
| VLM 定位/计数不稳 | 第 1 周双模型对比；低置信转人工；演示用精选公开图；报告标注局限性 |
| API 延迟/费用/限流 | 图片压缩、hash 缓存、模型分级、预算上限、供应商降级链 |
| 4 周范围失控 | 11/14 硬性功能冻结；非 MVP 一律砍 |
| 评审期服务不可用 | 云服务器 + 监控 + 样例结果预缓存 + 视频兜底 |
| 数据集/标准版权 | 仅用许可清晰的公开数据与自拍图；标准逐条核对来源与版本 |
| 文档/视频延误 | 第 3 周开始写脚本与文档骨架 |
| Git 历史真实性 | 按功能提交，保留分支与 PR 记录 |
| 视觉提示注入 | 不可信数据原则、工具白名单、Schema 校验、攻击测试集 |

---

## 20. 创新点

### 20.1 技术创新

1. **证据链约束生成（Evidence-Constrained Generation）**：报告结论只能引用结构化证据，Verifier 强制校验，抑制幻觉。
2. **数字与叙述分离**：所有指标由代码计算，LLM 仅负责语言组织，可审计、可复现。
3. **确定性 Agent 状态机 + 自我校验 + 人在回路**：兼顾自主性与可靠性。
4. **视觉提示注入防御**：把图片内文字视为不可信数据，配合工具白名单与输出校验。
5. **MCP 暴露巡检工具**：应用内 Function Calling 与外部 MCP 客户端共用同一工具层。
6. **可量化评测体系**：检测按 GT 匹配评估，RAG/Agent 均有金标准集，敢公开指标。

### 20.2 应用创新

1. **拍照即巡检**：把专业巡检流程降门槛到"拍照 + 一句话"。
2. **三向证据链交互**：报告 ↔ 识别框 ↔ 标准条款联动，AI 结论可核查。
3. **计划确认与成本透明**：执行前告知范围、耗时与费用，用户可调整。
4. **自然语言纠错闭环**：对单图追加提示重跑，纠错数据反哺评测。

---

## 21. 评分对齐

| 评分项 | 作品落点 |
|---|---|
| LLM 集成 8% | 模型路由、结构化输出、Prompt 版本化、缓存与预算控制 |
| Agent 8% | 状态机、工具调用、计划确认、Verifier 自我校验 |
| RAG 6% | 引用强制、知识库页、Recall@5 评测、无依据拒答 |
| 多模态 5% | 图像 + 语音 + 视频、统一 InspectionContext |
| AI 安全 4% | 证据链、注入防御、置信度分级、隐私与审计 |
| MCP 4% | MCP Server + 现场客户端调用演示 |
| 创新 25% | 证据链双向跳转、计划确认、自然语言纠错、评测透明 |
| 前端工程 10% | TS strict + Zod、组件分层、性能指标、测试 |
| 实用性 10% | 真实巡检闭环、GT 匹配后的 P/R/F1 |
| UX 10% | 三栏工作台、流式渲染、错误隔离与降级 |
| 社会/商业 10% | 公民科学降门槛、环保 SaaS、低成本可复制 |

---

## 22. 提交前需补充的信息

以下为运营信息，不影响设计：

- 参赛组别（研究生组 / A / B / C）与学校。
- 团队成员姓名、分工、指导老师。
- 云端 API Key 与预算确认。
- 公网服务器与域名（可选）。
- 项目正式名称（当前暂用"清川"）。

---

## 23. 验收标准

- 本机 `npm install && npm run dev` 可启动，无 GPU/Docker/WSL 依赖。
- 上传一组样例图可完成识别、复核、报告生成与导出。
- 报告中的结论均可点击定位到识别框与标准条款。
- RAG 无依据时明确拒答；注入攻击测试不执行图片内指令。
- MCP 客户端可调用至少 3 个工具。
- `/eval` 或文档中给出检测 P/R/F1、RAG Recall@5、Agent 成功率与成本数据。
- 公网演示地址在评审期可用（若做在线演示）。

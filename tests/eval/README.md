# 评测夹具（tests/eval）

本目录保存检测（detection）、RAG 与 Agent 三类评测的输入夹具。评测脚本位于
`scripts/eval-detection.ts`、`scripts/eval-rag.ts`、`scripts/eval-agent.ts`（Task 23），
结果写入 `data/eval/results.json`，由 `/eval` 页面读取展示。

## 诚实性规则

- **不得编造 GT 或评测结果。** `data/eval/results.json` 只能由真实评测脚本运行生成，
  禁止手工编写、补齐或修改其中的数字。
- **不得编造标注。** `detection-fixtures.json` 当前包含 10 张人工标注的 NOAA 单目标
  裁片；新增样本必须来自真实图片并逐张标注，不能用模型预测冒充 GT。结果只作为本项目
  的小样本自查，不是公开基准。
- **dry-run 不是效果证据。** `--dry-run` 只验证 IoU 匹配与脚本管线，使用夹具里的
  `pred` 而非模型真实输出；页面会显示「dry-run，仅验证评测管线，不作为效果证据」。
- **RAG 问题必须可从已入库语料回答。** 问题只能依据 `data/knowledge/*.md` 中已登记
  来源的条款；不得引入语料中不存在的规定。无答案题用于验证拒答，而不是凑召回率。
- **Agent 场景只在真实依赖下运行。** 需要 `DASHSCOPE_API_KEY` 与
  `public/samples/sample-1.jpg`；缺少依赖时脚本应报错，而不是生成虚假结果。

## 夹具结构

### `rag-questions.json`

```json
[
  { "question": "塑料瓶属于哪一类垃圾？", "expectedStandardNo": "GB/T 19095-2019", "expectedClause": "第3.1条" },
  { "question": "火星上的垃圾按什么标准分类？", "expectNoEvidence": true }
]
```

- 数组元素二选一：
  - 可答题：`question` + `expectedStandardNo` + `expectedClause`；条款号只在同一标准内
    唯一，因此必须同时写标准号。
  - 无答案题：`question` + `expectNoEvidence: true`；用于检验系统是否拒答，不能同时
    写期望条款。
- 当前 60 题（50 道可答 + 10 道无答案），覆盖 `清川SOP`、`CJJ/T 174-2013`、
  `DB31/T 1639-2025`、`GB/T 19095-2019` 四份语料。
- `scripts/eval-rag.ts` 取前 5 条，计算 Recall@5、Recall@3、MRR 与无答案准确率；
  四个指标分别计算，不把拒答题混进召回率分母。
- 带 reranker 的评测阈值 `DEFAULT_RERANK_MIN_SCORE = 0.65` 是在这 60 题上校准的；
  无 reranker 的 MCP/回退路径使用 `DEFAULT_HYBRID_MIN_SCORE = 0.45`，因为两种分数
  不在同一尺度。结果会记录 `rerankThreshold`、`hybridThreshold`、`rerankerFallbacks`
  与每题分数，便于审计。这批指标属于自建小样本自查，不能当作公开基准。

### `rag-questions-heldout.json`

- 与校准集同 schema，当前 32 题（22 道可答 + 10 道近义干扰/无答案）。
- **阈值在运行前固定，禁止用这批题调阈值或改语料。** 它用于暴露校准集上的过拟合。
- 运行方式：`npm run eval:rag:heldout`，结果写入 `ragHeldout` 段。
- 当前真实结果：Recall@5 1.00、Recall@3 1.00、MRR 0.977、无答案准确率 **0.30**。
  负向结果说明：问题点名一个标准、但答案只存在于另一标准时，当前检索会返回
  “别的标准”的条款；下一步应做来源约束，并在**新的** held-out 集上验证，而不是
  在这批题上调阈值。

### `rag-questions-heldout-scoped.json`

- 与校准集同 schema，当前 30 题（20 道可答 + 10 道近义干扰/无答案）。
- 这是 **source-scoped retrieval 修复后新建的 held-out**，题目不复用校准集或旧 held-out；
  只运行一次，**未用于调阈值或改语料**。
- 运行方式：`npm run eval:rag:scoped`，结果写入 `ragScoped` 段。
- 当前真实结果：Recall@5 0.95、Recall@3 0.95、MRR 0.925、无答案准确率 **1.00**。
  唯一可答 miss 是“清川SOP 规定严重度如何分级？”被 scoped 后判为无依据；保留为
  下一轮新 held-out 的改进线索，不要回头调这批题。

### `detection-fixtures.json`

```json
[
  {
    "image": "river-01.jpg",
    "gt": [
      { "category": "plastic_bottle", "bbox": { "x": 0.1, "y": 0.2, "w": 0.1, "h": 0.2 } }
    ],
    "pred": [
      { "category": "plastic_bottle", "bbox": { "x": 0.1, "y": 0.2, "w": 0.1, "h": 0.2 } }
    ]
  }
]
```

- 数组元素：
  - `image`：图片文件名或仓库相对路径；裸文件名按 `public/samples/<image>` 解析，
    带路径分隔符时按仓库根目录解析（见 `scripts/eval-detection.ts`）。
  - `gt`：该图的真实标注，元素为 `{ category, bbox }`。`category` 必须是
    `src/lib/domain/schemas.ts` 中 `DebrisCategory` 的取值；`bbox` 使用归一化坐标
    （相对图片宽高，取值 0–1）：`x`/`y` 为左上角，`w`/`h` 为宽高。
  - `pred`：可选，仅 dry-run 使用，模拟模型预测以验证匹配管线；它不是模型真实输出，
    不能用于证明效果。
- 当前包含 10 张 **NOAA 公有领域巡检图的单目标裁片**（`public/samples/eval/single-*.jpg`），
  每张由人工标注 1–2 个显眼目标。裁片来自 `sample-1.jpg` / `sample-2.jpg` / `sample-3.jpg`
  的局部；标注为人工绘制、框较粗，不是大规模基准。结果只能作为本项目的自查证据，
  不应与公开基准的 mAP/F1 直接比较。

#### 补齐检测夹具的步骤

1. 获取**真实**图片（自拍或授权/许可兼容的公开数据），放入 `public/samples/` 或
   `public/samples/eval/`，路径与 `image` 字段一致。当前裁片均来自 NOAA 公有领域图。
2. 对每张图逐个人工标注**全部**可见垃圾目标：类别取自 `DebrisCategory`，框紧贴目标，
   坐标为归一化值（`x/图片宽`、`y/图片高`、`w/图片宽`、`h/图片高`）。
3. 不要为了凑数虚构目标、复制别图标注或使用模型预测冒充 GT。没有把握的图不要加入。
4. 至少准备 10 张图后再运行 `npm run eval:detection`（live 模式需要
   `DASHSCOPE_API_KEY`）。
5. 结果只由脚本写入 `data/eval/results.json`，然后刷新 `/eval` 页面查看。
6. 仅调试匹配管线时可运行 `npm run eval:detection -- --dry-run`（需要夹具中的 `pred`），
   此时页面会明确标注结果不作为效果证据。

### `agent-scenarios.json`

```json
[
  { "name": "normal", "instruction": "检查塑料垃圾", "expectedStatus": "completed", "image": "sample-2.jpg" }
]
```

- 数组元素：`name`、`instruction`、`expectedStatus`（期望的 run 最终状态），
  以及可选的 `image`（`public/samples/` 下的文件名，缺省为 `sample-1.jpg`）。
- 四个场景：`normal`（正常完成）、`low-confidence`（低置信度需人工复核）、
  `no-evidence`（知识库无依据仍完成）、`injection`（提示注入被拒绝而失败）。
- `normal` / `no-evidence` 使用 `sample-2.jpg`（该图在当前模型下没有 <0.5 的检出），
  `low-confidence` 使用 `sample-1.jpg`（含低置信目标）；`injection` 在读取图片前即被拒绝。
- 由 `scripts/eval-agent.ts` 针对内存数据库逐场景执行，统计成功率与平均耗时。

## 运行方式

```bash
# 检测：先按上文补齐真实标注
npm run eval:detection

# RAG 校准集：先 npm run ingest 并配置 DASHSCOPE_API_KEY
npm run eval:rag

# RAG held-out：修复前基线，阈值固定
npm run eval:rag:heldout

# RAG source-scoped held-out：修复后新题，只跑一次，不用于调参
npm run eval:rag:scoped

# Agent：配置 DASHSCOPE_API_KEY 且准备 public/samples/sample-1.jpg
npm run eval:agent
```

三个脚本都以合并方式更新 `data/eval/results.json` 中的 `generatedAt` 与各自结果段。

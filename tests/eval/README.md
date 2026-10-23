# 评测夹具（tests/eval）

本目录保存检测（detection）、RAG 与 Agent 三类评测的输入夹具。评测脚本位于
`scripts/eval-detection.ts`、`scripts/eval-rag.ts`、`scripts/eval-agent.ts`（Task 23），
结果写入 `data/eval/results.json`，由 `/eval` 页面读取展示。

## 诚实性规则

- **不得编造 GT 或评测结果。** `data/eval/results.json` 只能由真实评测脚本运行生成，
  禁止手工编写、补齐或修改其中的数字。
- **不得编造标注。** `detection-fixtures.json` 当前是空数组 `[]`，因为仓库里还没有
  真实的带标注样本图。空夹具意味着检测指标暂时没有证据价值；在补齐真实标注之前，
  不要发布检测数字，更不能用 dry-run 结果充当效果证据。
- **dry-run 不是效果证据。** `--dry-run` 只验证 IoU 匹配与脚本管线，使用夹具里的
  `pred` 而非模型真实输出；页面会显示「dry-run，仅验证评测管线，不作为效果证据」。
- **RAG 问题必须可从种子语料回答。** 问题只能依据 `data/knowledge/seed-sop.md` 的内容，
  不得引入标准中不存在的规定。
- **Agent 场景只在真实依赖下运行。** 需要 `DASHSCOPE_API_KEY` 与
  `public/samples/sample-1.jpg`；缺少依赖时脚本应报错，而不是生成虚假结果。

## 夹具结构

### `rag-questions.json`

```json
[
  { "question": "塑料瓶属于哪一类垃圾？", "expectedClause": "第2条" }
]
```

- 数组元素：`question` 为自然语言问题，`expectedClause` 为对应的种子 SOP 条款号
  （`第1条`–`第6条`）。
- 当前 35 题，覆盖 `第1条`–`第6条`，措辞包含多种问法；`scripts/eval-rag.ts` 用
  `retrieveClauses` 取前 5 条，命中 `expectedClause` 记为一次 Recall@5。
- 新增问题时请确认答案确实写在 `data/knowledge/seed-sop.md` 对应条款中。

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
  - `image`：图片文件名；live 模式按 `public/samples/<image>` 解析（见
    `scripts/eval-detection.ts`）。
  - `gt`：该图的真实标注，元素为 `{ category, bbox }`。`category` 必须是
    `src/lib/domain/schemas.ts` 中 `DebrisCategory` 的取值；`bbox` 使用归一化坐标
    （相对图片宽高，取值 0–1）：`x`/`y` 为左上角，`w`/`h` 为宽高。
  - `pred`：可选，仅 dry-run 使用，模拟模型预测以验证匹配管线；它不是模型真实输出，
    不能用于证明效果。
- 当前为 `[]`，这是有意的。没有真实标注就不应有检测数字。

#### 补齐检测夹具的步骤

1. 获取**真实**图片（自拍或授权/许可兼容的公开数据），放入 `public/samples/`，
   文件名与 `image` 字段一致。
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
  { "name": "normal", "instruction": "检查塑料垃圾", "expectedStatus": "completed" }
]
```

- 数组元素：`name`、`instruction`、`expectedStatus`（期望的 run 最终状态）。
- 四个场景：`normal`（正常完成）、`low-confidence`（低置信度需人工复核）、
  `no-evidence`（知识库无依据仍完成）、`injection`（提示注入被拒绝而失败）。
- 由 `scripts/eval-agent.ts` 针对内存数据库逐场景执行，统计成功率与平均耗时。

## 运行方式

```bash
# 检测：先按上文补齐真实标注
npm run eval:detection

# RAG：先 npm run ingest 并配置 DASHSCOPE_API_KEY
npm run eval:rag

# Agent：配置 DASHSCOPE_API_KEY 且准备 public/samples/sample-1.jpg
npm run eval:agent
```

三个脚本都以合并方式更新 `data/eval/results.json` 中的 `generatedAt` 与各自结果段。

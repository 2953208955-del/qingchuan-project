import Link from "next/link";

const values = [
  {
    title: "拍照即巡检",
    body: "上传现场照片，Agent 自动完成识别、严重度评估与取证，无需手写巡检记录。",
  },
  {
    title: "证据可追溯",
    body: "每条结论都回链到原图与检测框，报告中的数字可逐项复核，不做无依据的断言。",
  },
  {
    title: "报告由代码算数",
    body: "严重度公式与统计口径固化在代码中，同样的输入得到同样的报告。",
  },
];

const highlights = [
  {
    title: "确定性的严重度公式",
    body: "按垃圾类型、覆盖面积与所处水域加权计算，结果由代码给出，不依赖模型的主观描述。",
  },
  {
    title: "证据回链的结论",
    body: "每个判定都附带图像证据 ID 与检测框坐标，报告中可逐条回看原始证据。",
  },
  {
    title: "低置信度人工复核",
    body: "模型不确定时自动标记并进入人工复核队列，不把低置信结果直接写成结论。",
  },
  {
    title: "知识库引用",
    body: "处置建议引用知识库条目，保留标准来源与条款号，方便追溯依据。",
  },
];

export default function Home() {
  return (
    <div className="py-10 sm:py-16">
      <section>
        <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          多模态巡检 Agent
        </span>
        <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          清川 · AI 河湖垃圾巡检
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          面向河湖巡查场景的巡检助手：从一张现场照片出发，完成识别、严重度评估、证据链整理与报告生成。
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/inspect"
            className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            开始示例巡检
          </Link>
          <span className="text-sm text-muted-foreground">
            使用内置示例照片，无需准备数据。
          </span>
        </div>
      </section>

      <section aria-labelledby="values-heading" className="mt-12">
        <h2 id="values-heading" className="sr-only">
          核心价值
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {values.map((value) => (
            <div
              key={value.title}
              className="rounded-xl border border-border bg-card p-5 text-card-foreground"
            >
              <h3 className="font-heading text-base font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{value.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="architecture-heading"
        className="mt-12 rounded-xl border border-border bg-card p-6 text-card-foreground"
      >
        <h2 id="architecture-heading" className="font-heading text-lg font-semibold">
          架构亮点
        </h2>
        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
          {highlights.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="font-medium text-foreground">{item.title}</strong>
                ：{item.body}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

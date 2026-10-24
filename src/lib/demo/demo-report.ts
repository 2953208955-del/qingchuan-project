import { buildEvidenceIndex, verifyReport } from '@/lib/domain/evidence'
import { computeSeverity } from '@/lib/domain/severity'
import type { Detection, ReportDraft } from '@/lib/domain/schemas'

export const DEMO_IMAGE_COUNT = 3

// The demo run is hand-constructed: the detections, counts and report prose are
// authored here, not produced by a live model. It exists to demonstrate the
// review/export UI, so it is labeled `source: 'manual'` and says so in its
// limitations (never presented as evaluation evidence).
export function buildDemoReport(): { detections: Detection[]; report: ReportDraft } {
  const detections: Detection[] = [
    { id: 'demo-d1', imageId: 'demo-img-1', category: 'plastic_bottle', material: 'PET', confidence: 0.92, bbox: { x: 0.12, y: 0.2, w: 0.08, h: 0.16 }, description: '透明塑料瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d2', imageId: 'demo-img-1', category: 'plastic_bag', material: 'PE', confidence: 0.88, bbox: { x: 0.4, y: 0.3, w: 0.14, h: 0.12 }, description: '白色塑料袋', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d3', imageId: 'demo-img-1', category: 'plastic_bottle', material: 'PET', confidence: 0.86, bbox: { x: 0.7, y: 0.55, w: 0.07, h: 0.14 }, description: '饮料瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d4', imageId: 'demo-img-2', category: 'fishing_gear', material: '尼龙', confidence: 0.79, bbox: { x: 0.2, y: 0.4, w: 0.2, h: 0.1 }, description: '废弃渔网', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d5', imageId: 'demo-img-2', category: 'plastic_bag', material: 'PE', confidence: 0.45, bbox: { x: 0.5, y: 0.2, w: 0.12, h: 0.1 }, description: '疑似包装袋', source: 'vlm', reviewStatus: 'pending' },
    { id: 'demo-d6', imageId: 'demo-img-2', category: 'glass', material: '玻璃', confidence: 0.83, bbox: { x: 0.75, y: 0.6, w: 0.06, h: 0.12 }, description: '玻璃瓶', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d7', imageId: 'demo-img-3', category: 'foam', material: 'EPS', confidence: 0.91, bbox: { x: 0.3, y: 0.5, w: 0.1, h: 0.08 }, description: '泡沫碎块', source: 'vlm', reviewStatus: 'confirmed' },
    { id: 'demo-d8', imageId: 'demo-img-3', category: 'plastic_bottle', material: 'PET', confidence: 0.38, bbox: { x: 0.6, y: 0.3, w: 0.07, h: 0.14 }, description: '疑似塑料瓶', source: 'vlm', reviewStatus: 'pending' },
  ]

  // 演示数字必须由与生产相同的严重度公式算出，且与固定的示例值一致。
  const severity = computeSeverity(detections, DEMO_IMAGE_COUNT)
  if (severity.weightedTotal !== 9.8 || severity.intensity !== 3.27 || severity.overall !== 'medium') {
    throw new Error(
      '演示识别结果与严重度公式不一致，未写入任何数据：' +
        `weightedTotal=${severity.weightedTotal}, intensity=${severity.intensity}, severity=${severity.overall}。` +
        '请检查 src/lib/domain/severity.ts 或演示识别结果。',
    )
  }

  const metrics: ReportDraft['metrics'] = {
    imageCount: DEMO_IMAGE_COUNT,
    detectionCount: detections.length,
    weightedTotal: severity.weightedTotal,
    intensity: severity.intensity,
    severity: severity.overall,
    formulaVersion: severity.formulaVersion,
  }

  const report: ReportDraft = {
    title: '示例河段 A 段巡检报告（人工构造演示）',
    location: '示例河段 A 段',
    inspectedAt: new Date().toISOString(),
    source: 'manual',
    claims: [
      { id: 'demo-c1', section: 'summary', text: '本次共分析 3 张图片，识别到 8 个垃圾目标，以塑料类为主。', evidenceIds: ['metric:overall'] },
      { id: 'demo-c2', section: 'findings', text: '发现塑料瓶 3 个、塑料袋 2 个、泡沫塑料 1 个、渔网渔具 1 处、玻璃 1 个。', evidenceIds: ['detection:demo-d1', 'detection:demo-d2', 'detection:demo-d4'] },
      { id: 'demo-c3', section: 'severity', text: '加权检出强度为 3.27，整体严重度为中；渔网渔具与玻璃需优先处理。', evidenceIds: ['metric:overall', 'detection:demo-d4', 'detection:demo-d6'] },
      { id: 'demo-c4', section: 'recommendations', text: '建议优先清理渔网渔具与玻璃，塑料类安排人工打捞。', evidenceIds: ['detection:demo-d4', 'detection:demo-d6'] },
      { id: 'demo-c5', section: 'limitations', text: '未做面积标定，检出强度仅按图片数量计算；2 个低置信目标待人工复核。', evidenceIds: ['detection:demo-d5', 'detection:demo-d8'] },
    ],
    metrics,
    citations: [],
    modelInfo: { textModel: 'deepseek-chat', visionModel: 'qwen2.5-vl-max-latest', promptVersion: 'reporter-v1' },
    limitations: [
      '未做面积标定',
      '2 个低置信目标待人工复核',
      '本演示由人工构造的示例识别结果生成，不是实时 AI 输出，不代表真实评测结果。',
    ],
  }

  // 用生产 Verifier 自检报告：证据 ID 必须存在、数字必须与识别结果一致。
  const index = buildEvidenceIndex({ detections, clauses: [], metrics })
  const verification = verifyReport(report, index)
  if (!verification.passed) {
    throw new Error(
      '演示报告自检未通过，未写入任何数据：\n' +
        verification.issues.map(issue => `  - ${issue.claimId ?? ''} ${issue.message}`).join('\n'),
    )
  }

  return { detections, report }
}

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { VISION_PRECISION_TRIAL_PROMPT } from '../src/lib/ai/prompts'
import { matchDetections, type DetectionLike } from '../src/lib/eval/metrics'
import { DEFAULT_VISION_MODEL } from '../src/lib/eval/results'
import { QwenVisionAnalyzer } from '../src/lib/vision/qwen'

type Coco = {
  images: { id: number; file_name: string; width: number; height: number; region: string }[]
  annotations: { id: number; image_id: number; bbox: [number, number, number, number] }[]
}

async function main() {
  const [dataset, output, variant] = process.argv.slice(2)
  if (variant && variant !== '--precision-trial') throw new Error('未知实验选项')
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim()
  if (!dataset || !output || !apiKey) throw new Error('需要数据集目录、结果路径及 DASHSCOPE_API_KEY')
  const data = JSON.parse(await fs.readFile(path.join(dataset, 'instances_val.json'), 'utf8')) as Coco
  const model = process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL
  const analyzer = new QwenVisionAnalyzer({
    apiKey,
    model,
    systemPrompt: variant === '--precision-trial' ? VISION_PRECISION_TRIAL_PROMPT : undefined,
  })
  const temp = await fs.mkdtemp(path.join(path.dirname(path.resolve(output)), 'floatwaste-input-'))
  const results = []
  try {
    for (let offset = 0; offset < data.images.length; offset += 4) {
      const batch = await Promise.all(data.images.slice(offset, offset + 4).map(async img => {
        const input = path.join(temp, String(img.id) + '.jpg')
        await sharp(path.join(dataset, img.file_name)).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg().toFile(input)
        const imageId = String(img.id)
        const gt: DetectionLike[] = data.annotations.filter(a => a.image_id === img.id).map(a => ({
          id: String(a.id), imageId, category: 'other',
          bbox: { x: a.bbox[0] / img.width, y: a.bbox[1] / img.height, w: a.bbox[2] / img.width, h: a.bbox[3] / img.height },
        }))
        const result = await analyzer.analyze({ imagePath: input })
        const pred: DetectionLike[] = result.detections.filter(d => d.category !== 'natural').map((d, i) => ({
          id: String(i), imageId, category: 'other', bbox: d.bbox,
        }))
        const scores = result.abstained ? null : matchDetections(gt, pred, 0.5)
        return { id: img.id, file: img.file_name, region: img.region, gt: gt.length, scores, reason: result.reason, detections: result.detections, usage: result.usage }
      }))
      results.push(...batch)
      console.log(JSON.stringify(batch.map(({ id, scores, reason }) => ({ id, scores, reason }))))
      await fs.writeFile(output, JSON.stringify({ model, variant: variant ?? 'baseline', iou: 0.5, classAgnostic: true, expectedImages: data.images.length, results }, null, 2))
    }
  } finally {
    await Promise.all(data.images.map(img => fs.rm(path.join(temp, String(img.id) + '.jpg'), { force: true })))
    await fs.rmdir(temp)
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })

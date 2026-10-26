import Link from 'next/link'
import { HoloPanel } from '@/components/holo/holo-panel'

export const metadata = {
  title: '隐私与数据说明 · 清川',
  description: '清川的图片处理、数据流向、保留期限与第三方 AI 服务说明',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-2">
        <p className="holo-eyebrow">QINGCHUAN · PRIVACY</p>
        <h1 className="text-2xl font-light tracking-wide text-[var(--holo-text)]">隐私与数据说明</h1>
        <p className="text-sm leading-7 text-[var(--holo-muted)]">
          清川是竞赛原型，没有账号体系、广告脚本或 Cookie 追踪。以下说明上传图片如何被处理、
          发送到哪里，以及如何删除。
        </p>
      </header>

      <HoloPanel title="上传图片如何处理">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--holo-muted)]">
          <li>上传文件仅接受 JPEG、PNG、WebP，单张不超过 15MB。</li>
          <li>服务端会用 sharp 重新编码图片，自动旋转，并把最长边限制在 2000px。</li>
          <li><strong className="font-normal text-[var(--holo-text)]">重新编码会剥离 EXIF/GPS/XMP 等元数据</strong>，不会保留拍摄地点、设备型号等信息。</li>
          <li>处理后的图片与 SQLite 数据库保存在部署机的 <code>DATA_DIR</code>，不存入第三方对象存储。</li>
        </ul>
      </HoloPanel>

      <HoloPanel title="哪些内容会发送到云端">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--holo-muted)]">
          <li>执行巡检分析时，处理后的图片会发送到阿里云 DashScope 的 Qwen-VL 视觉模型。</li>
          <li>巡检指令、检索查询、报告上下文会发送到 DashScope（Embedding / Rerank）与 DeepSeek（文本报告）。</li>
          <li>API Key 只保存在服务端环境变量中，不会下发到浏览器。</li>
          <li>第三方模型服务可能按其自身政策保留请求数据；本应用不控制其保留期限。</li>
        </ul>
      </HoloPanel>

      <HoloPanel title="不要上传什么">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--holo-muted)]">
          <li>可识别人脸、车牌、身份证件、住址等个人信息。</li>
          <li>涉及国家秘密、商业秘密或未公开的敏感水域资料。</li>
          <li>如现场无法避免，请先打码或裁剪，再上传。</li>
        </ul>
      </HoloPanel>

      <HoloPanel title="保留与删除">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--holo-muted)]">
          <li>本地数据由部署者管理；演示环境应定期清理上传目录与数据库记录。</li>
          <li>删除 <code>DATA_DIR/uploads</code> 中对应图片，并清理 SQLite 中相关任务/识别记录，即可移除本地数据。</li>
          <li>第三方云端请求的删除需按对应服务商的控制台与政策处理。</li>
        </ul>
      </HoloPanel>

      <p className="text-xs leading-6 text-[var(--holo-muted)]">
        继续使用即表示你已阅读上述说明。返回
        <Link href="/inspect" className="ml-1 text-[var(--holo-cyan)] underline underline-offset-2">
          巡检工作台
        </Link>
        。
      </p>
    </div>
  )
}

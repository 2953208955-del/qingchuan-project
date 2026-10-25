'use client'

import { useId, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { useInspectionStore } from '@/stores/inspection-store'
import { MAX_IMAGES_PER_RUN } from '@/lib/domain/limits'
import type { UploadedImage } from '@/lib/domain/schemas'

const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type UploadResponse = { filename: string; path: string; sha256: string }

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return '仅支持 JPEG、PNG、WebP 格式'
  if (file.size > MAX_FILE_BYTES) return '文件超过 15MB'
  return null
}

async function uploadOne(file: File): Promise<UploadResponse> {
  // Keep compression on the main thread: the library's worker mode fetches
  // its own script from a CDN (libURL), which hangs offline and in E2E runs.
  const compressed = await imageCompression(file, { maxWidthOrHeight: 1600, useWebWorker: false })
  const form = new FormData()
  form.append('file', compressed, file.name)
  const res = await fetch('/api/uploads', { method: 'POST', body: form })
  const json = (await res.json().catch(() => null)) as (Partial<UploadResponse> & { message?: string }) | null
  if (!res.ok || !json?.filename || !json.path || !json.sha256) {
    throw new Error(json?.message ?? '上传失败')
  }
  return { filename: json.filename, path: json.path, sha256: json.sha256 }
}

export function UploadDropzone({ disabled = false, onBusyChange }: {
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const images = useInspectionStore(s => s.images)

  async function onFiles(files: FileList | null) {
    // Guard against a picker opened before the parent disabled uploading.
    if (!files?.length || disabled) return
    // Snapshot before awaiting: the input may be reset while uploads run.
    const all = Array.from(files)
    const already = useInspectionStore.getState().images.length
    const remaining = MAX_IMAGES_PER_RUN - already
    if (remaining <= 0) {
      setError(`单次巡检最多 ${MAX_IMAGES_PER_RUN} 张图片，请先开始本次巡检或移除已选图片`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const list = all.slice(0, remaining)
    const skipped = all.length - list.length
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    setProgress({ done: 0, total: list.length })

    const uploaded: UploadedImage[] = []
    const failures: string[] = []
    if (skipped > 0) {
      failures.push(`另有 ${skipped} 张未上传：单次巡检最多 ${MAX_IMAGES_PER_RUN} 张图片`)
    }
    try {
      for (const [index, file] of list.entries()) {
        // Validate before compression so oversized/wrong-type files never reach the
        // compression worker or the network.
        const invalid = validateFile(file)
        if (invalid) {
          failures.push(`${file.name}：${invalid}`)
        } else {
          // Generated outside the upload try so an ID failure is never
          // misreported as a failed upload.
          const id = crypto.randomUUID()
          try {
            const data = await uploadOne(file)
            uploaded.push({
              id,
              filename: data.filename,
              path: data.path,
              sha256: data.sha256,
              status: 'pending',
            })
          } catch (err) {
            failures.push(`${file.name}：${(err as Error).message || '上传失败'}`)
          }
        }
        setProgress({ done: index + 1, total: list.length })
      }

      if (uploaded.length > 0) {
        const store = useInspectionStore.getState()
        store.addImages(uploaded)
        // Changing the image list invalidates an existing plan.
        if (store.plan) store.setPlan(null)
      }
      if (failures.length > 0) {
        setError(`以下文件未能上传：${failures.join('；')}`)
      }
    } finally {
      setBusy(false)
      setProgress(null)
      onBusyChange?.(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section aria-label="上传图片" className="space-y-3">
      {/* The native input stays in the DOM for assistive tech and for tests;
          the dashed zone is its label, so a click anywhere opens the picker. */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="选择巡检图片"
        disabled={disabled || busy}
        onChange={e => onFiles(e.target.files)}
        className="sr-only"
      />
      <label
        htmlFor={inputId}
        className="upload-zone"
        data-disabled={disabled || busy ? 'true' : undefined}
      >
        <span className="upload-zone__icon" aria-hidden>
          <ImagePlus size={20} strokeWidth={1.4} />
        </span>
        <span className="upload-zone__title">投放或选择巡检照片</span>
        <span className="upload-zone__hint">点击选择图片 · 支持 JPEG、PNG、WebP，单张不超过 15MB</span>
      </label>
      <p className="inspect-meta" aria-live="polite">
        {busy
          ? `正在上传 ${progress?.done ?? 0}/${progress?.total ?? 0}…`
          : `已选 ${images.length}/${MAX_IMAGES_PER_RUN} 张，单张不超过 15MB，支持 JPEG、PNG、WebP`}
      </p>
      {error && (
        <p role="alert" className="inspect-alert">
          {error}
        </p>
      )}
    </section>
  )
}

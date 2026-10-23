'use client'

import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionResultLike = {
  [index: number]: { transcript: string }
}

type SpeechRecognitionEventLike = {
  results: { [index: number]: SpeechRecognitionResultLike }
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export function VoiceInput({ onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  // Keep the latest callback reachable without recreating the recognizer.
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    setSupported(true)
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) onTextRef.current(transcript)
      setListening(false)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => {
      setListening(false)
      setError('语音识别失败，请重试或改用文本输入')
    }
    recRef.current = rec

    // Stop recognition when the input unmounts so the microphone is released.
    return () => {
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try {
        rec.stop()
      } catch {
        // stop() throws when recognition was never started; nothing to release.
      }
      if (recRef.current === rec) recRef.current = null
    }
  }, [])

  if (!supported) return <p className="text-xs text-muted-foreground">当前浏览器不支持语音，请使用文本输入</p>

  function startListening() {
    const rec = recRef.current
    if (!rec) return
    setError(null)
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
      setError('语音识别启动失败，请重试或改用文本输入')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={startListening}
        disabled={listening || disabled}
        aria-label={listening ? '正在聆听语音指令' : '使用语音输入巡检指令'}
        className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {listening ? '聆听中…' : '🎙 语音指令'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

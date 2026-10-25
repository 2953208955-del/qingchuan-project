import type {
  DebrisCategory,
  Detection,
  RunStatus,
  UploadedImage,
} from '@/lib/domain/schemas'

export type DashboardDetection = Detection & { createdAt: number }

export type DashboardRun = {
  id: string
  instruction: string
  location: string | null
  status: RunStatus
  createdAt: number
  isDemo: boolean
  hasReport: boolean
  images: UploadedImage[]
  detections: DashboardDetection[]
}

export type CategoryCount = { category: DebrisCategory; label: string; count: number }

export type CategorySlice = { key: string; label: string; count: number }

export type ConfidenceBin = { label: string; min: number; max: number; count: number }

export type MapPoint = {
  id: string
  detectionId: string
  imageId: string
  category: DebrisCategory
  label: string
  confidence: number
  reviewStatus: Detection['reviewStatus']
  severity: 'normal' | 'review' | 'natural'
  x: number
  y: number
}

export type DashboardStats = {
  totalRuns: number
  totalDetections: number
  pendingLowConfidence: number
  averageConfidence: number
  reportCount: number
  clauseCount: number
  categoryMix: CategoryCount[]
  confidenceBins: ConfidenceBin[]
}

export type DashboardOverview = {
  heroRun: DashboardRun | null
  stats: DashboardStats
  mapPoints: MapPoint[]
  hiddenMapPointCount: number
}

// Single source of truth for provider model IDs. The 2025 model names
// (qwen2.5-vl-max-latest, text-embedding-v3, gte-rerank) are gone from the
// current DashScope account, so these defaults are the names it actually
// accepts. Each can be overridden through the environment for future swaps.
export const DEFAULT_TEXT_MODEL = 'deepseek-chat'
export const DEFAULT_VISION_MODEL = 'qwen3-vl-plus'
export const DEFAULT_EMBEDDING_MODEL = 'qwen3.7-text-embedding'
export const DEFAULT_RERANK_MODEL = 'qwen3.7-text-rerank'

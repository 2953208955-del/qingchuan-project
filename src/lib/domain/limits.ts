// The design spec (§3.1) scopes one inspection to 5–20 photos. 20 is also the
// cost ceiling that keeps a single run inside RUN_BUDGET_CNY at the published
// Qwen-VL price, so it is enforced both at run creation and in the uploader.
export const MAX_IMAGES_PER_RUN = 20

// ティア別機能制御

export const TIERS = ['member', 'creator', 'producer', 'partner']

export const TIER_LABELS = {
  member: 'メンバー',
  creator: 'クリエイター',
  producer: 'プロデューサー',
  partner: 'パートナー',
}

// 機能ごとの必要ティア
export const FEATURE_REQUIREMENTS = {
  sequences_unlimited: 'creator',
  sequence_conditions: 'creator',
  broadcast_schedule: 'producer',
  rich_menu_auto_switch: 'producer',
  csv_export: 'producer',
}

export function canUse(userTier, feature) {
  const required = FEATURE_REQUIREMENTS[feature]
  if (!required) return true
  return TIERS.indexOf(userTier) >= TIERS.indexOf(required)
}

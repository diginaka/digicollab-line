// standaloneモード / Token未設定時のデモデータ

export const demoFriends = [
  { userId: 'U001', displayName: '田中 美咲', pictureUrl: '', statusMessage: 'ヨガインストラクター', tags: ['メンバー', 'ウェビナー参加'], email: 'tanaka@example.com', stripeCustomerId: 'cus_001' },
  { userId: 'U002', displayName: '鈴木 健太', pictureUrl: '', statusMessage: '', tags: ['無料'], email: null, stripeCustomerId: null },
  { userId: 'U003', displayName: '佐藤 由美', pictureUrl: '', statusMessage: 'オンライン講座運営', tags: ['クリエイター', 'LP購入済'], email: 'sato@example.com', stripeCustomerId: 'cus_003' },
  { userId: 'U004', displayName: '山田 太郎', pictureUrl: '', statusMessage: '', tags: ['無料'], email: null, stripeCustomerId: null },
  { userId: 'U005', displayName: '高橋 あかり', pictureUrl: '', statusMessage: 'マーケター', tags: ['プロデューサー', 'ウェビナー参加', 'LP購入済'], email: 'takahashi@example.com', stripeCustomerId: 'cus_005' },
  { userId: 'U006', displayName: '中村 翔', pictureUrl: '', statusMessage: '', tags: ['メンバー', 'blocked'], email: null, stripeCustomerId: null },
  { userId: 'U007', displayName: '伊藤 花', pictureUrl: '', statusMessage: 'カフェオーナー', tags: ['無料', 'ウェビナー参加'], email: 'ito@example.com', stripeCustomerId: null },
  { userId: 'U008', displayName: '小林 誠', pictureUrl: '', statusMessage: 'コンサルタント', tags: ['クリエイター', 'カート購入済'], email: 'kobayashi@example.com', stripeCustomerId: 'cus_008' },
]

export const demoSequences = [
  {
    id: 'seq-1',
    name: 'ウェルカムシーケンス',
    description: '友だち追加後の3日間フォローアップ',
    triggerType: 'friend_added',
    isActive: true,
    steps: [
      { order: 1, delayMinutes: 0, messageType: 'text', messageContent: 'はじめまして！友だち追加ありがとうございます😊\n毎日お役立ち情報をお届けします。' },
      { order: 2, delayMinutes: 1440, messageType: 'text', messageContent: '昨日はありがとうございました！\n今日は「無料プレゼント」のご案内です🎁' },
      { order: 3, delayMinutes: 2880, messageType: 'text', messageContent: 'ウェビナーのご案内です。\nお時間あればぜひご参加ください✨' },
    ],
  },
  {
    id: 'seq-2',
    name: 'ウェビナーリマインド',
    description: 'ウェビナー参加タグ追加後のリマインド',
    triggerType: 'tag_added',
    isActive: true,
    steps: [
      { order: 1, delayMinutes: 0, messageType: 'text', messageContent: 'ウェビナー登録ありがとうございます！\n前日にリマインドをお送りしますね。' },
      { order: 2, delayMinutes: 1380, messageType: 'text', messageContent: '明日はウェビナー当日です🎉\nZoomリンクは当日の朝にお送りします。' },
    ],
  },
  {
    id: 'seq-3',
    name: '購入後フォローアップ',
    description: 'ご購入者様限定のフォロー',
    triggerType: 'purchase_completed',
    isActive: false,
    steps: [
      { order: 1, delayMinutes: 60, messageType: 'text', messageContent: 'ご購入ありがとうございます！\nご不明点があればいつでもご連絡ください💌' },
    ],
  },
]

export const demoBroadcasts = [
  { id: 'bc-1', name: '4月キャンペーン告知', targetTags: ['無料', 'メンバー'], messageContent: '今月限定20%オフのキャンペーン実施中！', status: 'sent', scheduledAt: null, sentAt: '2026-04-01 10:00', totalSent: 38 },
  { id: 'bc-2', name: '新ツールリリース通知', targetTags: ['クリエイター', 'プロデューサー'], messageContent: '新しいツールをリリースしました🎉', status: 'sent', scheduledAt: null, sentAt: '2026-04-05 09:00', totalSent: 12 },
  { id: 'bc-3', name: '週末ウェビナー招待', targetTags: ['メンバー'], messageContent: '今週末のウェビナーご案内です！', status: 'scheduled', scheduledAt: '2026-04-12 18:00', sentAt: null, totalSent: 0 },
]

export const demoRichMenus = [
  {
    id: 'rm-1',
    name: 'メインメニュー',
    layoutType: '2x3',
    areas: [
      { label: 'サービス紹介', action: { type: 'uri', uri: 'https://example.com/services' } },
      { label: 'ブログ', action: { type: 'uri', uri: 'https://example.com/blog' } },
      { label: 'お問合せ', action: { type: 'uri', uri: 'https://example.com/contact' } },
      { label: '無料相談', action: { type: 'message', text: '無料相談希望' } },
      { label: 'SNS', action: { type: 'uri', uri: 'https://example.com/sns' } },
      { label: 'ログイン', action: { type: 'uri', uri: 'https://example.com/login' } },
    ],
    targetTags: ['無料'],
    isDefault: true,
    isActive: true,
  },
  {
    id: 'rm-2',
    name: 'メンバー専用メニュー',
    layoutType: '2x3',
    areas: [
      { label: 'マイページ', action: { type: 'uri', uri: 'https://example.com/mypage' } },
      { label: '講座一覧', action: { type: 'uri', uri: 'https://example.com/courses' } },
      { label: 'コミュニティ', action: { type: 'uri', uri: 'https://example.com/community' } },
      { label: 'サポート', action: { type: 'message', text: 'サポート希望' } },
      { label: '購入履歴', action: { type: 'uri', uri: 'https://example.com/orders' } },
      { label: 'ログアウト', action: { type: 'message', text: 'ログアウト' } },
    ],
    targetTags: ['メンバー', 'クリエイター', 'プロデューサー'],
    isDefault: false,
    isActive: true,
  },
]

export const demoStats = {
  totalFriends: 52,
  readRate: 76.5,
  newThisWeek: 7,
  sentThisMonth: 148,
  quota: 200,
  deliveryHistory: [
    { date: '4/3', count: 12 },
    { date: '4/4', count: 8 },
    { date: '4/5', count: 24 },
    { date: '4/6', count: 15 },
    { date: '4/7', count: 32 },
    { date: '4/8', count: 18 },
    { date: '4/9', count: 39 },
  ],
  friendsGrowth: [
    { week: '5週前', count: 28 },
    { week: '4週前', count: 34 },
    { week: '3週前', count: 39 },
    { week: '2週前', count: 43 },
    { week: '1週前', count: 48 },
    { week: '今週', count: 52 },
  ],
}

export const tagColors = {
  '無料': 'bg-blue-100 text-blue-700 border-blue-200',
  'メンバー': 'bg-green-100 text-green-700 border-green-200',
  'クリエイター': 'bg-purple-100 text-purple-700 border-purple-200',
  'プロデューサー': 'bg-amber-100 text-amber-700 border-amber-200',
  'ウェビナー参加': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'LP購入済': 'bg-pink-100 text-pink-700 border-pink-200',
  'カート購入済': 'bg-rose-100 text-rose-700 border-rose-200',
  'blocked': 'bg-slate-200 text-slate-600 border-slate-300',
}

export function getTagColor(tag) {
  return tagColors[tag] || 'bg-slate-100 text-slate-700 border-slate-200'
}

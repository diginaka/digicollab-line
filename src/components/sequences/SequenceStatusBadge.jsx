// シーケンスの状態を1行で示すバッジ (mail/LINE 統一デザイン)
//   active : 🟢 自動配信中  (emerald)
//   draft  : 🟡 下書き      (amber)
//   error  : 🔴 配信エラー  (red)
//   empty  : ⚪ 未生成      (slate)
//
// Phase B.6 hotfix (2026-05-02): 達也さん UI テストで mail 側「目視ではわからない」状態を
// 解消するため、mail/digicollab-mail/src/components/sequences/SequenceStatusBadge.jsx と
// 完全同一デザインに統一 (Phase 2-A 5 色トークンへの依存を撤廃)。
//
// 旧来 (Phase B 拡張版):
//   - active: bg-digi-green/10 → 背景 (digi-bg = #F8FAF9) と区別がつきにくい
//   - empty:  bg-digi-bg → 親背景と完全同色化、ほぼ透明に見える
//
// 新方針 (Phase B.6):
//   - 標準 Tailwind パレット (emerald / amber / red / slate) で意味的コントラストを確保
//   - text 色を -700 → -900 (より濃く)
//   - border 色を -200 → -300 (定義をはっきりさせる)
//   - empty の bg を -100 → -200 (背景と差をつける)
//   - sm サイズを text-[10px] → text-[11px] + font-bold (極小でも読める)
import { Zap, FileEdit, AlertTriangle, CircleDashed } from 'lucide-react'

const STATUS_MAP = {
  active: {
    label: '自動配信中',
    icon: Zap,
    cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  draft: {
    label: '下書き',
    icon: FileEdit,
    cls: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  error: {
    label: '配信エラー',
    icon: AlertTriangle,
    cls: 'bg-red-100 text-red-900 border-red-300',
  },
  empty: {
    label: '未生成',
    icon: CircleDashed,
    cls: 'bg-slate-200 text-slate-700 border-slate-400',
  },
}

export default function SequenceStatusBadge({ status = 'empty', size = 'md' }) {
  const def = STATUS_MAP[status] || STATUS_MAP.empty
  const Icon = def.icon
  const sizeCls =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5 gap-1 font-bold'
      : size === 'lg'
      ? 'text-sm px-3 py-1.5 gap-1.5 font-bold'
      : 'text-xs px-2 py-1 gap-1.5 font-bold'
  const iconCls =
    size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeCls} ${def.cls}`}
      data-sequence-status={status}
    >
      <Icon className={iconCls} />
      {def.label}
    </span>
  )
}

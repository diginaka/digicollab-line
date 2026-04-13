import { Users, Send, Workflow, Calendar, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import { demoStats, demoSequences, demoBroadcasts } from '../lib/demoData'

export default function Dashboard({ isTokenSet, setCurrentPage }) {
  const stats = demoStats
  const activeSequences = demoSequences.filter((s) => s.isActive).length
  const scheduledBroadcasts = demoBroadcasts.filter((b) => b.status === 'scheduled').length
  const recentBroadcasts = demoBroadcasts.slice(0, 3)

  return (
    <div className="p-6 max-w-7xl mx-auto" data-page="dashboard">
      {/* セットアップ誘導 */}
      {!isTokenSet && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3" data-setup-banner>
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-yellow-900 mb-1">LINE公式アカウントを接続してください</div>
            <div className="text-sm text-yellow-800 mb-2">
              現在デモデータを表示中です。設定画面からChannel Access Tokenを入力すると、あなたのLINEアカウントのデータが表示されます。
            </div>
            <button
              onClick={() => setCurrentPage('settings')}
              className="text-sm font-bold text-white px-3 py-1.5 rounded-lg hover:opacity-90"
              style={{ backgroundColor: '#06C755' }}
            >
              設定画面を開く →
            </button>
          </div>
        </div>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="友だち合計" value={stats.totalFriends} unit="人" color="#06C755" trend={`+${stats.newThisWeek}/週`} />
        <StatCard icon={Send} label="今月の配信数" value={stats.sentThisMonth} unit={`/${stats.quota}通`} color="#3b82f6" trend={`残${stats.quota - stats.sentThisMonth}通`} />
        <StatCard icon={Workflow} label="稼働中シーケンス" value={activeSequences} unit="本" color="#8b5cf6" trend="正常稼働中" />
        <StatCard icon={Calendar} label="予約ブロードキャスト" value={scheduledBroadcasts} unit="件" color="#f59e0b" trend="今週予定" />
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">配信数推移（直近7日）</h3>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-end gap-2 h-40">
            {stats.deliveryHistory.map((d, i) => {
              const max = Math.max(...stats.deliveryHistory.map((x) => x.count))
              const h = (d.count / max) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t transition-all" style={{ height: `${h}%`, backgroundColor: '#06C755' }} />
                  <div className="text-[10px] text-slate-500">{d.date}</div>
                  <div className="text-[10px] text-slate-700 font-bold">{d.count}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">友だち数推移（6週）</h3>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-end gap-2 h-40">
            {stats.friendsGrowth.map((d, i) => {
              const max = Math.max(...stats.friendsGrowth.map((x) => x.count))
              const h = (d.count / max) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t transition-all" style={{ height: `${h}%`, backgroundColor: '#3b82f6' }} />
                  <div className="text-[10px] text-slate-500">{d.week}</div>
                  <div className="text-[10px] text-slate-700 font-bold">{d.count}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 直近の配信ログ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">直近の配信ログ</h3>
          <button onClick={() => setCurrentPage('broadcasts')} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
            すべて見る <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2">
          {recentBroadcasts.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50">
              <div>
                <div className="text-sm font-medium text-slate-800">{b.name}</div>
                <div className="text-xs text-slate-500">{b.sentAt || b.scheduledAt}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">{b.totalSent}人</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  b.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {b.status === 'sent' ? '配信済' : '予約中'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, unit, color, trend }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5" data-stat-card>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <span className="text-xs text-slate-500">{trend}</span>
      </div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{unit}</div>
      </div>
    </div>
  )
}

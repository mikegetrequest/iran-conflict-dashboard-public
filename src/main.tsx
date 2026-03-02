import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import moment from 'moment'
import Globe from 'react-globe.gl'

type GuardianItem = { webTitle: string; webUrl: string; webPublicationDate: string }
type GuardianResp = { response?: { results?: GuardianItem[] } }
type GdeltItem = { title: string; url: string; domain?: string; seendate?: string }
type GdeltResp = { articles?: GdeltItem[] }
type Rss2JsonItem = { title: string; link: string; pubDate?: string }
type Rss2JsonResp = { items?: Rss2JsonItem[] }

type FeedItem = { title: string; link: string; published?: string; source: string }
type DataJson = { status?: { dxb_dwc?: string; uae_posture?: string } }
type Point = { lat: number; lng: number; size: number; color: string }

const coords: Record<string, [number, number]> = {
  Iran: [32.42, 53.68], Israel: [31.04, 34.85], UAE: [23.42, 53.84], Dubai: [25.2, 55.27],
  Qatar: [25.35, 51.18], Bahrain: [25.93, 50.63], Kuwait: [29.31, 47.48],
  Lebanon: [33.85, 35.86], Oman: [21.47, 55.97], Tehran: [35.68, 51.38]
}

const cardClass = 'rounded-xl border border-zinc-200 p-4 bg-white shadow-sm'
const badgeClass = 'inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600'

function Card(props: React.PropsWithChildren<{ title: string; value: React.ReactNode; tone?: 'default' | 'danger' | 'warn' }>) {
  const toneClass = props.tone === 'danger' ? 'text-red-600' : props.tone === 'warn' ? 'text-amber-600' : 'text-zinc-900'
  return (
    <div className={cardClass}>
      <div className="text-xs uppercase text-zinc-500">{props.title}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{props.value}</div>
      {props.children}
    </div>
  )
}

async function fetchGuardian(): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    q: 'Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait OR Lebanon OR Oman',
    'page-size': '10',
    'order-by': 'newest',
    'api-key': 'test'
  })
  const { data } = await axios.get<GuardianResp>(`https://content.guardianapis.com/search?${params.toString()}`)
  return (data.response?.results ?? []).map((x) => ({ title: x.webTitle, link: x.webUrl, published: x.webPublicationDate, source: 'The Guardian' }))
}

async function fetchGDELT(): Promise<FeedItem[]> {
  const q = encodeURIComponent('(Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait) AND (missile OR strike OR attack OR conflict)')
  const { data } = await axios.get<GdeltResp>(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=10&format=json&sort=datedesc`)
  return (data.articles ?? []).map((x) => ({ title: x.title, link: x.url, published: x.seendate, source: x.domain ? `GDELT/${x.domain}` : 'GDELT' }))
}

async function fetchAlJazeeraRss(): Promise<FeedItem[]> {
  const rssUrl = encodeURIComponent('https://www.aljazeera.com/xml/rss/all.xml')
  const { data } = await axios.get<Rss2JsonResp>(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`)
  return (data.items ?? [])
    .filter((x) => /iran|israel|uae|dubai|qatar|bahrain|kuwait|lebanon|hezbollah|tehran|missile|strike|attack/i.test(x.title))
    .slice(0, 10)
    .map((x) => ({ title: x.title, link: x.link, published: x.pubDate, source: 'Al Jazeera RSS' }))
}

async function fetchStatus(): Promise<DataJson> {
  const { data } = await axios.get<DataJson>('./data.json')
  return data
}

function toPoints(items: FeedItem[]): Point[] {
  const out: Point[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const t = item.title.toLowerCase()
    for (const [k, [lat, lng]] of Object.entries(coords)) {
      if (t.includes(k.toLowerCase())) {
        const key = `${lat},${lng}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ lat, lng, size: 0.38, color: '#2563eb' })
        }
      }
    }
  }
  return out
}

function relativeTime(value?: string): string {
  if (!value) return 'time n/a'
  const m = moment(value)
  return m.isValid() ? m.fromNow() : 'time n/a'
}

function mergeAndDedup(feeds: FeedItem[][]): FeedItem[] {
  const seen = new Set<string>()
  const merged: FeedItem[] = []
  feeds.flat().forEach((item) => {
    const key = `${item.title}::${item.link}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(item)
    }
  })
  return merged.slice(0, 24)
}

function App() {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [loading, setLoading] = React.useState(true)
  const [fetching, setFetching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<FeedItem[]>([])
  const [status, setStatus] = React.useState<DataJson>({})
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const refresh = React.useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const [g1, g2, g3, st] = await Promise.all([
        fetchGuardian().catch(() => []),
        fetchGDELT().catch(() => []),
        fetchAlJazeeraRss().catch(() => []),
        fetchStatus().catch(() => ({}))
      ])
      setItems(mergeAndDedup([g1, g2, g3]))
      setStatus(st)
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
      setFetching(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  const points = React.useMemo(() => toPoints(items), [items])

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <header>
        <div className="text-sm text-zinc-500">Live {fetching ? '• refreshing' : ''}</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">Iran Conflict Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Timezone: {browserTz} • Updated: {updatedAt ? updatedAt.toLocaleString('en-GB', { hour12: false }) : 'loading...'}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card title="DXB / DWC" value={status.status?.dxb_dwc ?? 'Loading...'} tone="danger" />
        <Card title="Total live items" value={items.length} />
        <Card title="Sources" value="Guardian + GDELT + AJ RSS" />
        <Card title="UAE posture" value={status.status?.uae_posture ?? 'Elevated'} tone="warn" />
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-zinc-200 text-sm text-zinc-600">Regional activity map</div>
        <div className="h-[420px] md:h-[540px] flex items-center justify-center">
          <div className="w-full h-full flex items-center justify-center">
            <Globe
              globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              backgroundColor="#ffffff"
              atmosphereColor="#60a5fa"
              atmosphereAltitude={0.12}
              pointsData={points}
              pointColor="color"
              pointAltitude="size"
              pointRadius={0.3}
            />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Latest headlines</h2>
        <p className="text-sm text-zinc-500 mt-1">Relative time shown in your local timezone context.</p>

        {loading && <div className="mt-3 h-20 rounded-lg border border-zinc-200 bg-zinc-50 animate-pulse" />}
        {error && <div className="mt-3 text-sm text-amber-700">{error}</div>}

        <div className="mt-3 space-y-2">
          {items.map((h, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 p-4 bg-white">
              <a href={h.link} target="_blank" rel="noreferrer" className="text-base font-medium hover:underline">{h.title}</a>
              <div className="text-xs text-zinc-500 mt-2">{h.source} • {relativeTime(h.published)}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          <span className={badgeClass}>Guardian</span>
          <span className={badgeClass}>GDELT</span>
          <span className={badgeClass}>Al Jazeera RSS</span>
        </div>
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

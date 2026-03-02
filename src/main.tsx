import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import moment from 'moment'

type GuardianItem = { webTitle: string; webUrl: string; webPublicationDate: string }
type GuardianResp = { response?: { results?: GuardianItem[] } }
type GdeltItem = { title: string; url: string; domain?: string; seendate?: string }
type GdeltResp = { articles?: GdeltItem[] }
type Rss2JsonItem = { title: string; link: string; pubDate?: string }
type Rss2JsonResp = { items?: Rss2JsonItem[] }

type FeedItem = { title: string; link: string; published?: string; source: string }

type DynamicStatus = {
  airportLine: string
  mofaLine: string
}

async function fetchGuardian(): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    q: 'Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait OR Lebanon OR Oman',
    'page-size': '12',
    'order-by': 'newest',
    'api-key': 'test'
  })
  const { data } = await axios.get<GuardianResp>(`https://content.guardianapis.com/search?${params.toString()}`)
  return (data.response?.results ?? []).map((x) => ({
    title: x.webTitle,
    link: x.webUrl,
    published: x.webPublicationDate,
    source: 'The Guardian'
  }))
}

async function fetchGDELT(): Promise<FeedItem[]> {
  const q = encodeURIComponent('(Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait) AND (missile OR strike OR attack OR conflict)')
  const { data } = await axios.get<GdeltResp>(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=10&format=json&sort=datedesc`)
  return (data.articles ?? []).map((x) => ({
    title: x.title,
    link: x.url,
    published: x.seendate,
    source: x.domain ? `GDELT/${x.domain}` : 'GDELT'
  }))
}

async function fetchAlJazeeraRss(): Promise<FeedItem[]> {
  const rssUrl = encodeURIComponent('https://www.aljazeera.com/xml/rss/all.xml')
  const { data } = await axios.get<Rss2JsonResp>(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`)
  return (data.items ?? [])
    .filter((x) => /iran|israel|uae|dubai|qatar|bahrain|kuwait|lebanon|hezbollah|tehran|missile|strike|attack/i.test(x.title))
    .slice(0, 12)
    .map((x) => ({
      title: x.title,
      link: x.link,
      published: x.pubDate,
      source: 'Al Jazeera RSS'
    }))
}

function pickLine(raw: string, patterns: RegExp[], fallback: string): string {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  const hit = lines.find((l) => patterns.some((p) => p.test(l)))
  return hit ?? fallback
}

async function fetchDynamicStatus(): Promise<DynamicStatus> {
  const [airportRaw, mofaRaw] = await Promise.all([
    axios.get<string>('https://r.jina.ai/http://www.dubaiairports.ae/', { responseType: 'text' }).then((r) => r.data).catch(() => ''),
    axios.get<string>('https://r.jina.ai/http://www.mofa.gov.ae/en', { responseType: 'text' }).then((r) => r.data).catch(() => '')
  ])

  const airportLine = pickLine(
    airportRaw,
    [/dxb/i, /dwc/i, /suspend/i, /airport/i],
    'Airport status currently unavailable from source fetch.'
  )

  const mofaLine = pickLine(
    mofaRaw,
    [/iran/i, /ambassador/i, /embassy/i, /condemn/i, /statement/i],
    'Latest MOFA line currently unavailable from source fetch.'
  )

  return { airportLine, mofaLine }
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
  return merged.slice(0, 36)
}

function App() {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [loading, setLoading] = React.useState(true)
  const [fetching, setFetching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<FeedItem[]>([])
  const [status, setStatus] = React.useState<DynamicStatus | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const refresh = React.useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const [g1, g2, g3, st] = await Promise.all([
        fetchGuardian().catch(() => []),
        fetchGDELT().catch(() => []),
        fetchAlJazeeraRss().catch(() => []),
        fetchDynamicStatus().catch(() => ({ airportLine: 'Unavailable', mofaLine: 'Unavailable' }))
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 text-[14px] leading-6">
      <header className="border-b border-zinc-200 pb-3">
        <div className="text-[12px] text-zinc-500">
          Live {fetching ? '• refreshing' : ''} • Timezone: {browserTz}
        </div>
        <h1 className="text-[16px] font-semibold mt-1">Iran Conflict Dashboard</h1>
        <p className="text-[12px] text-zinc-500 mt-1">
          Updated: {updatedAt ? updatedAt.toLocaleString('en-GB', { hour12: false }) : 'loading...'}
        </p>
      </header>

      <section className="mt-4 space-y-2">
        <h2 className="text-[16px] font-semibold">Status</h2>
        <div className="border border-zinc-200 rounded-md p-3">
          <div className="font-medium">Airport</div>
          <div className="text-zinc-700">{status?.airportLine ?? 'Loading airport status...'}</div>
        </div>
        <div className="border border-zinc-200 rounded-md p-3">
          <div className="font-medium">UAE MOFA</div>
          <div className="text-zinc-700">{status?.mofaLine ?? 'Loading MOFA line...'}</div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-[16px] font-semibold">Latest headlines</h2>
        {loading && <div className="mt-2 h-16 rounded border border-zinc-200 bg-zinc-50 animate-pulse" />}
        {error && <div className="mt-2 text-amber-700">Fetch issue: {error}</div>}

        <div className="mt-2 divide-y divide-zinc-200 border border-zinc-200 rounded-md">
          {items.map((h, i) => (
            <article key={i} className="p-3">
              <a href={h.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {h.title}
              </a>
              <div className="text-[12px] text-zinc-500 mt-1">
                {h.source} • {relativeTime(h.published)}
              </div>
            </article>
          ))}
          {!loading && items.length === 0 && <div className="p-3 text-zinc-500">No items returned right now.</div>}
        </div>
      </section>

      <footer className="mt-4 text-[12px] text-zinc-500">
        Sources: Guardian API • GDELT API • Al Jazeera RSS • Dubai Airports • UAE MOFA
      </footer>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

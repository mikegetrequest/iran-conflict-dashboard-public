import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import moment from 'moment'
import Globe from 'react-globe.gl'

type GuardianItem = { webTitle: string; webUrl: string; webPublicationDate: string }
type GuardianResp = { response?: { results?: GuardianItem[] } }
type GdeltItem = { title: string; url: string; domain?: string; seendate?: string }
type GdeltResp = { articles?: GdeltItem[] }
type FeedItem = { title: string; link: string; published?: string; source: string }
type DynamicStatus = { airportLine: string; mofaLine: string }
type Point = { lat: number; lng: number; size: number; color: string }

const http = axios.create({ timeout: 12000 })



const relevancePattern = /(iran|israel|uae|dubai|qatar|bahrain|kuwait|tehran|hezbollah|lebanon|missile|strike|attack|airspace|airport|dxb|dwc)/i

function isRelevant(title: string): boolean {
  return relevancePattern.test(title)
}

function priorityScore(title: string): number {
  const t = title.toLowerCase()
  let score = 0
  ;['dubai','uae','dxb','dwc','airspace','airport','missile','strike','attack','qatar','bahrain','kuwait','tehran','hezbollah','lebanon'].forEach(k=>{ if(t.includes(k)) score += 2 })
  if(t.includes('live')) score += 1
  return score
}

const coords: Record<string, [number, number]> = {
  Iran: [32.42, 53.68], Israel: [31.04, 34.85], UAE: [23.42, 53.84], Dubai: [25.2, 55.27],
  Qatar: [25.35, 51.18], Bahrain: [25.93, 50.63], Kuwait: [29.31, 47.48],
  Lebanon: [33.85, 35.86], Oman: [21.47, 55.97], Tehran: [35.68, 51.38]
}

async function fetchGuardian(): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    q: 'Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait OR Lebanon OR Oman',
    'page-size': '12',
    'order-by': 'newest',
    'api-key': 'test'
  })
  const { data } = await http.get<GuardianResp>(`https://content.guardianapis.com/search?${params.toString()}`)
  return (data.response?.results ?? [])
    .map((x) => ({ title: x.webTitle, link: x.webUrl, published: x.webPublicationDate, source: 'The Guardian' }))
    .filter((x) => isRelevant(x.title))
}

async function fetchGDELT(): Promise<FeedItem[]> {
  const q = encodeURIComponent('(Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait) AND (missile OR strike OR attack OR conflict)')
  const { data } = await http.get<GdeltResp>(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=10&format=json&sort=datedesc`)
  return (data.articles ?? []).map((x) => ({ title: x.title, link: x.url, published: x.seendate, source: x.domain ? `GDELT/${x.domain}` : 'GDELT' }))
}

async function fetchAlJazeeraViaJina(): Promise<FeedItem[]> {
  const { data } = await http.get<string>('https://r.jina.ai/http://www.aljazeera.com/news/', { responseType: 'text' })
  const lines = data.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((s) => /iran|israel|uae|dubai|qatar|bahrain|kuwait|lebanon|hezbollah|tehran|missile|strike|attack/i.test(s))
    .slice(0, 10)
  return lines.map((title, i) => ({ title, link: 'https://www.aljazeera.com/news/', published: `line-${i + 1}`, source: 'Al Jazeera (extract)' }))
}

function pickLine(raw: string, patterns: RegExp[], fallback: string): string {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  const hit = lines.find((l) => patterns.some((p) => p.test(l)))
  return hit ?? fallback
}

async function fetchDynamicStatus(): Promise<DynamicStatus> {
  const [airportRaw, mofaRaw] = await Promise.all([
    http.get<string>('https://r.jina.ai/http://www.dubaiairports.ae/', { responseType: 'text' }).then((r) => r.data).catch(() => ''),
    http.get<string>('https://r.jina.ai/http://www.mofa.gov.ae/en', { responseType: 'text' }).then((r) => r.data).catch(() => '')
  ])
  return {
    airportLine: pickLine(airportRaw, [/dxb/i, /dwc/i, /suspend/i, /operations/i, /travel to the airport/i, /advisory/i], 'Airport status unavailable right now.'),
    mofaLine: pickLine(mofaRaw, [/summon/i, /ambassador/i, /embassy/i, /iran/i, /condemn/i, /protest note/i], 'MOFA line unavailable right now.')
  }
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
    if (!seen.has(key)) { seen.add(key); merged.push(item) }
  })
  return merged.sort((a,b)=>{const ps=priorityScore(b.title)-priorityScore(a.title); if(ps!==0) return ps; return (new Date(b.published||0).getTime())-(new Date(a.published||0).getTime());}).slice(0, 20)
}

function toPoints(items: FeedItem[]): Point[] {
  const out: Point[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const t = item.title.toLowerCase()
    for (const [k, [lat, lng]] of Object.entries(coords)) {
      if (t.includes(k.toLowerCase())) {
        const key = `${lat},${lng}`
        if (!seen.has(key)) { seen.add(key); out.push({ lat, lng, size: 0.38, color: '#2563eb' }) }
      }
    }
  }
  return out
}

function App() {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [loading, setLoading] = React.useState(true)
  const [fetching, setFetching] = React.useState(false)
  const [errors, setErrors] = React.useState<string[]>([])
  const [items, setItems] = React.useState<FeedItem[]>([])
  const [status, setStatus] = React.useState<DynamicStatus | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const refresh = React.useCallback(async () => {
    setFetching(true)
    const results = await Promise.allSettled([fetchGuardian(), fetchGDELT(), fetchAlJazeeraViaJina(), fetchDynamicStatus()])
    const errs: string[] = []
    const feeds: FeedItem[][] = []
    let dynamic: DynamicStatus = { airportLine: 'Loading...', mofaLine: 'Loading...' }
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        if (i <= 2) feeds.push(r.value as FeedItem[])
        if (i === 3) dynamic = r.value as DynamicStatus
      } else {
        errs.push(`source-${i + 1} unavailable`)
      }
    })
    setItems(mergeAndDedup(feeds))
    setStatus(dynamic)
    setErrors(errs)
    setUpdatedAt(new Date())
    setLoading(false)
    setFetching(false)
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  const points = React.useMemo(() => toPoints(items), [items])

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 text-[14px] leading-6">
      <header className="border-b border-zinc-200 pb-3">
        <div className="text-[12px] text-zinc-500">Live {fetching ? '• refreshing' : ''} • {browserTz}</div>
        <h1 className="text-[16px] font-semibold mt-1">Iran Conflict Dashboard</h1>
        <p className="text-[12px] text-zinc-500 mt-1">Updated: {updatedAt ? updatedAt.toLocaleString('en-GB', { hour12: false }) : 'loading...'}</p>
      </header>

      <section className="mt-4 space-y-2">
        <h2 className="text-[16px] font-semibold">Status</h2>
        <div className="border border-zinc-200 rounded-md p-3"><div className="font-medium">Airport</div><div className="text-zinc-700">{status?.airportLine ?? 'Loading airport status...'}</div></div>
        <div className="border border-zinc-200 rounded-md p-3"><div className="font-medium">UAE MOFA</div><div className="text-zinc-700">{status?.mofaLine ?? 'Loading MOFA line...'}</div></div>
      </section>

      <section className="mt-5 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
        <div className="px-3 py-2 border-b border-zinc-200 text-[12px] text-zinc-600">Regional activity map</div>
        <div className="h-[300px] md:h-[420px] flex items-center justify-center">
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
      </section>

      <section className="mt-5">
        <h2 className="text-[16px] font-semibold">Quick read</h2>
        <div className="mt-2 border border-zinc-200 rounded-md p-3 text-zinc-700">
          <div><strong>Airport:</strong> {status?.airportLine ?? 'Loading...'}</div>
          <div className="mt-1"><strong>MOFA:</strong> {status?.mofaLine ?? 'Loading...'}</div>
          <div className="mt-1"><strong>Top signal:</strong> {items[0]?.title ?? 'No fresh conflict headline yet.'}</div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-[16px] font-semibold">Latest headlines</h2>
        {loading && <div className="mt-2 h-16 rounded border border-zinc-200 bg-zinc-50 animate-pulse" />}
        {errors.length > 0 && <div className="mt-2 text-[12px] text-amber-700">Partial data: {errors.join(', ')}</div>}
        <div className="mt-2 divide-y divide-zinc-200 border border-zinc-200 rounded-md">
          {items.map((h, i) => (
            <article key={i} className="p-3">
              <a href={h.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">{h.title}</a>
              <div className="text-[12px] text-zinc-500 mt-1">{h.source} • {relativeTime(h.published)}</div>
            </article>
          ))}
          {!loading && items.length === 0 && <div className="p-3 text-zinc-500">No items returned right now.</div>}
        </div>
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import Globe from 'react-globe.gl'

type GuardianItem = { webTitle: string; webUrl: string; webPublicationDate: string }
type GuardianResp = { response?: { results?: GuardianItem[] } }
type FeedItem = { title: string; link: string; published: string; source: string }
type DataJson = { status?: { dxb_dwc?: string; uae_posture?: string } }

type Point = { lat: number; lng: number; size: number; color: string }

const coords: Record<string, [number, number]> = {
  Iran: [32.42, 53.68],
  Israel: [31.04, 34.85],
  UAE: [23.42, 53.84],
  Dubai: [25.2, 55.27],
  Qatar: [25.35, 51.18],
  Bahrain: [25.93, 50.63],
  Kuwait: [29.31, 47.48],
  Lebanon: [33.85, 35.86],
  Oman: [21.47, 55.97],
  Tehran: [35.68, 51.38]
}

async function fetchGuardian(): Promise<FeedItem[]> {
  const params = new URLSearchParams({
    q: 'Iran OR Israel OR UAE OR Dubai OR Qatar OR Bahrain OR Kuwait OR Lebanon OR Oman',
    'page-size': '14',
    'order-by': 'newest',
    'api-key': 'test'
  })
  const { data } = await axios.get<GuardianResp>(`https://content.guardianapis.com/search?${params.toString()}`)
  return (data.response?.results ?? []).slice(0, 10).map((x) => ({
    title: x.webTitle,
    link: x.webUrl,
    published: x.webPublicationDate,
    source: 'theguardian.com'
  }))
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

function App() {
  const news = useQuery({ queryKey: ['guardian-news'], queryFn: fetchGuardian, refetchInterval: 30000, staleTime: 15000, retry: 2 })
  const status = useQuery({ queryKey: ['status-json'], queryFn: fetchStatus, refetchInterval: 30000, staleTime: 15000, retry: 1 })

  const items = news.data ?? []
  const points = React.useMemo(() => toPoints(items), [items])

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <header>
        <div className="text-sm text-zinc-500">Live - auto refresh 30s</div>
        <h1 className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight">Iran Conflict Dashboard</h1>
        <p className="mt-2 text-sm md:text-base text-zinc-500">
          Clean live monitor with typed React, Axios and React Query.
          {' '}Updated: {news.dataUpdatedAt ? new Date(news.dataUpdatedAt).toLocaleString('en-GB', { hour12: false }) : 'loading...'}
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 p-4 bg-white">
          <div className="text-xs uppercase text-zinc-500">DXB / DWC</div>
          <div className="text-lg font-semibold text-red-600 mt-1">{status.data?.status?.dxb_dwc ?? 'Loading...'}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 bg-white">
          <div className="text-xs uppercase text-zinc-500">Live API items</div>
          <div className="text-2xl font-semibold mt-1">{items.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 bg-white">
          <div className="text-xs uppercase text-zinc-500">Source</div>
          <div className="text-lg font-semibold mt-1">Guardian API</div>
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 bg-white">
          <div className="text-xs uppercase text-zinc-500">UAE posture</div>
          <div className="text-lg font-semibold text-amber-600 mt-1">{status.data?.status?.uae_posture ?? 'Elevated'}</div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-zinc-200 text-sm text-zinc-600">Regional activity map</div>
        <div className="h-[420px] md:h-[520px]">
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

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Latest headlines</h2>
        <p className="text-sm text-zinc-500 mt-1">Live items from Guardian Open Platform API.</p>

        {news.isLoading && <div className="mt-3 h-20 rounded-lg border border-zinc-200 bg-zinc-50 animate-pulse" />}
        {news.isError && <div className="mt-3 text-sm text-red-600">Failed to fetch live API data.</div>}

        <div className="mt-3 space-y-2">
          {items.map((h, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 p-4 bg-white">
              <a href={h.link} target="_blank" rel="noreferrer" className="text-base font-medium hover:underline">{h.title}</a>
              <div className="text-xs text-zinc-500 mt-2">{h.published}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

const qc = new QueryClient()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)

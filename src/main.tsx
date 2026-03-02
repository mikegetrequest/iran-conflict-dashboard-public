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
  Iran: [32.42, 53.68], Israel: [31.04, 34.85], UAE: [23.42, 53.84], Dubai: [25.2, 55.27],
  Qatar: [25.35, 51.18], Bahrain: [25.93, 50.63], Kuwait: [29.31, 47.48], Lebanon: [33.85, 35.86],
  Oman: [21.47, 55.97], Tehran: [35.68, 51.38]
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
          out.push({ lat, lng, size: 0.35, color: '#2563eb' })
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
    <main className="max-w-5xl mx-auto px-4 pt-6 pb-10">
      <div className="text-xs text-zinc-500">live / refresh 30s</div>
      <h1 className="mt-2 text-2xl font-semibold">Iran Conflict Dashboard</h1>
      <p className="mt-1 text-xs text-zinc-500">Type-safe React + Axios + React Query</p>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500 uppercase">DXB/DWC</div><div className="text-sm font-medium text-red-600">{status.data?.status?.dxb_dwc ?? 'Loading...'}</div></div>
        <div className="rounded-lg border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500 uppercase">API items</div><div className="text-sm font-medium">{items.length}</div></div>
        <div className="rounded-lg border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500 uppercase">Source</div><div className="text-sm font-medium">Guardian API</div></div>
        <div className="rounded-lg border border-zinc-200 p-2"><div className="text-[10px] text-zinc-500 uppercase">Posture</div><div className="text-sm font-medium text-amber-600">{status.data?.status?.uae_posture ?? 'Elevated'}</div></div>
      </div>

      <section className="w-[100vw] relative left-1/2 right-1/2 -mx-[50vw] mt-4 border-y border-zinc-200 bg-white">
        <div className="h-[62vh] min-h-[420px]">
          <Globe
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            backgroundColor="#ffffff"
            atmosphereColor="#60a5fa"
            atmosphereAltitude={0.12}
            pointsData={points}
            pointColor="color"
            pointAltitude="size"
            pointRadius={0.28}
          />
        </div>
      </section>

      <div className="mt-4">
        <h2 className="text-sm font-semibold mb-2">Latest headlines</h2>
        {news.isLoading && <div className="h-16 rounded-lg border border-zinc-200 bg-zinc-50 animate-pulse" />}
        {news.isError && <div className="text-sm text-red-600">Failed to fetch live API data.</div>}
        <div className="space-y-2">
          {items.map((h, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 p-3 text-sm">
              <a href={h.link} target="_blank" rel="noreferrer" className="hover:underline">{h.title}</a>
              <div className="text-[11px] text-zinc-500 mt-1">{h.published}</div>
            </div>
          ))}
        </div>
      </div>
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

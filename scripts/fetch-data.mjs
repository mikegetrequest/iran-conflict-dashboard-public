import fs from 'node:fs/promises';

const now = new Date();
const gst = new Date(now.getTime() + 4*60*60*1000).toISOString().replace('T',' ').slice(0,16);

async function getText(url){
  const r = await fetch(url, { headers: { 'User-Agent': 'iran-conflict-dashboard-bot/1.1' } });
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.text();
}
async function getJson(url){
  const r = await fetch(url, { headers: { 'User-Agent': 'iran-conflict-dashboard-bot/1.1' } });
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.json();
}

function topHeadlinesFromRSS(xml, max=6){
  const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g)];
  return matches.map(m=>({
    title: m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim(),
    published: m[2].trim(),
    link: m[3].trim()
  })).slice(0,max);
}

function topLinesFromHTML(html, max=6){
  const lines=[];
  const text=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');
  const candidates=[...text.matchAll(/>([^<>]{35,220})</g)].map(m=>m[1].trim());
  for(const c of candidates){
    if(/iran|israel|uae|dubai|qatar|bahrain|kuwait|tehran|missile|strike|attack|hezbollah|lebanon/i.test(c) && !lines.includes(c)) lines.push(c);
    if(lines.length>=max) break;
  }
  return lines.map((title,i)=>({title,published:`line-${i+1}`,link:'https://monitor-the-situation.com/middle-east'}));
}

async function gdeltEvents(max=8){
  const q = encodeURIComponent('("Iran" OR "Israel" OR "UAE" OR "Dubai" OR "Qatar" OR "Bahrain" OR "Kuwait") AND (missile OR strike OR attack OR conflict)');
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=${max}&format=json&sort=datedesc`;
  const j = await getJson(url);
  const arts = (j.articles || []).map(a => ({
    title: a.title,
    source: a.domain,
    published: a.seendate || a.socialimage || '',
    link: a.url
  }));
  return arts;
}

async function main(){
  const [ajRss, mtsHtml, gdelt] = await Promise.all([
    getText('https://www.aljazeera.com/xml/rss/all.xml').catch(()=>''),
    getText('https://monitor-the-situation.com/middle-east').catch(()=>''),
    gdeltEvents(10).catch(()=>[])
  ]);

  const aj = ajRss ? topHeadlinesFromRSS(ajRss, 10).filter(h=>/iran|israel|uae|dubai|qatar|bahrain|kuwait|tehran|missile|strike|attack|lebanon|hezbollah/i.test(h.title)).slice(0,6) : [];
  const mts = mtsHtml ? topLinesFromHTML(mtsHtml, 6) : [];

  const data = {
    updated_at_gst: gst,
    status: {
      dxb_dwc: 'Suspended until further notice (verify on official advisory)',
      uae_posture: 'High-alert diplomatic/security posture',
      note: 'Use official airport + airline channels before movement.'
    },
    sources: {
      gdelt_api: 'https://api.gdeltproject.org/api/v2/doc/doc',
      aljazeera_rss: 'https://www.aljazeera.com/xml/rss/all.xml',
      monitor_the_situation: 'https://monitor-the-situation.com/middle-east',
      dubaiairports: 'https://www.dubaiairports.ae/',
      mofa: 'https://www.mofa.gov.ae/en'
    },
    live_api_events: gdelt,
    headlines: {
      aljazeera: aj,
      monitor_the_situation: mts
    }
  };

  await fs.writeFile('data.json', JSON.stringify(data, null, 2));
  console.log('updated data.json', data.updated_at_gst, 'gdelt:', gdelt.length, 'aj:', aj.length, 'mts:', mts.length);
}

main().catch(err=>{console.error(err); process.exit(1);});

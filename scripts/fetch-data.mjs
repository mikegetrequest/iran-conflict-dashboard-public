import fs from 'node:fs/promises';

const now = new Date();
const gst = new Date(now.getTime() + 4*60*60*1000).toISOString().replace('T',' ').slice(0,16);

async function getText(url){
  const r = await fetch(url, { headers: { 'User-Agent': 'iran-conflict-dashboard-bot/1.0' } });
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.text();
}

function topHeadlinesFromRSS(xml, max=6){
  const items = [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g)]
    .map(m=>({title:m[1].trim(), published:m[2].trim(), link:m[3].trim()}));
  if(items.length) return items.slice(0,max);
  return [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g)]
    .map(m=>({title:m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim(), published:m[2].trim(), link:m[3].trim()}))
    .slice(0,max);
}

function topLinesFromHTML(html, max=6){
  // best-effort extraction for monitor-the-situation
  const lines = [];
  const text = html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');
  const candidates = [...text.matchAll(/>([^<>]{35,180})</g)].map(m=>m[1].trim());
  for(const c of candidates){
    if(/iran|israel|uae|dubai|qatar|bahrain|kuwait|tehran|missile|strike|attack/i.test(c) && !lines.includes(c)) lines.push(c);
    if(lines.length>=max) break;
  }
  return lines.map((title,i)=>({title,published:`line-${i+1}`,link:'https://monitor-the-situation.com/middle-east'}));
}

async function main(){
  const ajRss = await getText('https://www.aljazeera.com/xml/rss/all.xml');
  const aj = topHeadlinesFromRSS(ajRss, 8).filter(h=>/iran|israel|uae|dubai|qatar|bahrain|kuwait|tehran|missile|strike|attack|lebanon|hezbollah/i.test(h.title)).slice(0,6);

  const mtsHtml = await getText('https://monitor-the-situation.com/middle-east');
  const mts = topLinesFromHTML(mtsHtml, 6);

  const data = {
    updated_at_gst: gst,
    status: {
      dxb_dwc: 'Suspended until further notice (last verified from official advisory stream)',
      uae_posture: 'High-alert diplomatic/security posture',
      note: 'Always verify directly with official airport + airline channels before movement.'
    },
    sources: {
      aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
      monitor_the_situation: 'https://monitor-the-situation.com/middle-east',
      dubaiairports: 'https://www.dubaiairports.ae/',
      mofa: 'https://www.mofa.gov.ae/en'
    },
    headlines: {
      aljazeera: aj,
      monitor_the_situation: mts
    }
  };

  await fs.writeFile('data.json', JSON.stringify(data, null, 2));
  console.log('updated data.json', data.updated_at_gst, aj.length, mts.length);
}

main().catch(err=>{console.error(err); process.exit(1);});

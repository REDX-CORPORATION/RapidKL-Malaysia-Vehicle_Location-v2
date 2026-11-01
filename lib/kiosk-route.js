function parseRoutePage(html){
 const json=re=>{try{return JSON.parse(html.match(re)?.[1]||'null');}catch{return null;}};
 const rawStops=json(/(?:var|let|const)\s+bstp\s*=\s*(\[[\s\S]*?\]);/);
 const rawShapes=json(/(?:var|let|const)\s+shapes?\s*=\s*\$\.parseJSON\(`([\s\S]*?)`\)/)||json(/\$\.parseJSON\(`([\s\S]*?)`\)/);
 const stops=(Array.isArray(rawStops)?rawStops:[]).map(s=>({id:String(s.stop_id??s.id??''),name:String(s.stop_name??s.name??'Bus stop'),lat:Number(s.lat??s.latitude),lon:Number(s.lng??s.lon??s.longitude)})).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 const lines=Object.values(rawShapes||{}).filter(line=>Array.isArray(line)&&line.length>1&&line.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)));
 // The kiosk's stop array is not guaranteed to be ordered: do not invent a journey sequence.
 return {stops,lines};
}
async function enrich(route){
 if(!route.kioskId||route.directions?.length)return route;
 try{const r=await fetch('https://myrapidbus.prasarana.com.my/kiosk?route='+encodeURIComponent(route.kioskId)+'&bus=',{signal:AbortSignal.timeout(4000),headers:{'User-Agent':'JomNaik/2.1'}});if(!r.ok)throw new Error('Kiosk unavailable');const parsed=parseRoutePage(await r.text());return {...route,kioskStops:parsed.stops,kioskLines:parsed.lines};}catch{return route;}
}
module.exports={parseRoutePage,enrich};

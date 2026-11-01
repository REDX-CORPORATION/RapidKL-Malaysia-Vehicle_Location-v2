const {matchRoute,mergeBuses}=require('./matching');
const {kioskSnapshot,normalizeKiosk}=require('./kiosk-live');
const {transit_realtime}=require('./vendor/gtfs-realtime');
function normalize(buffer,data,now=Date.now()) {
 const feed=transit_realtime.FeedMessage.toObject(transit_realtime.FeedMessage.decode(buffer),{longs:Number,enums:String});
 const routes=new Map(data.routes.map(r=>[r.id,r]));
 const buses=(feed.entity||[]).flatMap(e=>{
  const v=e.vehicle,p=v?.position;if(!p || !Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||p.latitude < 0 || p.latitude > 8 || p.longitude<98 || p.longitude>120) return [];
  const trip=data.tripIndex?.[v.trip?.tripId];
  const routeId=routes.has(v.trip?.routeId)?v.trip.routeId:(trip?.[0]||v.trip?.routeId||'');
  const route=matchRoute(routeId,data); const timestamp=Number(v.timestamp||feed.header?.timestamp||0)*1000;
  return [{id:String(v.vehicle?.id||e.id),label:String(v.vehicle?.licensePlate||v.vehicle?.label||v.vehicle?.id||e.id),routeId:route?.id||routeId,source:'gtfs',routeNumber:route?.number||routeId||'Unknown',direction:v.trip?.directionId!=null?String(v.trip.directionId):(trip?.[1]??null),lat:p.latitude,lon:p.longitude,speed:p.speed!=null?Math.round(p.speed*3.6):null,bearing:p.bearing??null,timestamp,stale:!timestamp || now-timestamp>120000}];
 });
 return {buses,timestamp:Number(feed.header?.timestamp||0)*1000,fetchedAt:now,source:'Prasarana / data.gov.my'};
}
const cache=new Map(),pending=new Map();
async function gtfs(c,data){const r=await fetch('https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category='+c,{signal:AbortSignal.timeout(7000),headers:{'User-Agent':'JomNaik/2.1'}});if(!r.ok)throw new Error('GTFS unavailable');return normalize(Buffer.from(await r.arrayBuffer()),data);}
async function snapshot(c,data){
 const key=c==='rapid-bus-penang'?'penang':'kl';const old=cache.get(key);if(old&&Date.now()-old.fetchedAt<15000)return old;if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const provider=key==='kl'?'RKL':'RPG';const feeds=key==='kl'?['rapid-bus-kl','rapid-bus-mrtfeeder']:['rapid-bus-penang'];
  const results=await Promise.allSettled([kioskSnapshot(provider),...feeds.map(f=>gtfs(f,data))]);
  const groups=[],sources=[];
  results.forEach((r,i)=>{const name=i===0?'myRapid kiosk':feeds[i-1];sources.push({name,available:r.status==='fulfilled'});if(r.status==='fulfilled')groups.push(i===0?normalizeKiosk(r.value.raw,data,provider):r.value.buses);});
  if(!groups.length)throw new Error('All vehicle feeds unavailable');
  const buses=mergeBuses(groups),fetchedAt=Date.now();const result={buses,fetchedAt,timestamp:Math.max(0,...buses.map(b=>b.timestamp)),sources,source:'myRapid kiosk + data.gov.my',partial:sources.some(s=>!s.available)};cache.set(key,result);return result;
 })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
module.exports={normalize,snapshot};

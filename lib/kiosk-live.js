const {gunzipSync}=require('node:zlib');
const {randomUUID}=require('node:crypto');
const {matchRoute,publicNumber}=require('./matching');
const BASE='https://rapidbus-socketio-avl.prasarana.com.my/socket.io/';
function parseTime(value){if(typeof value==='number')return value<1e12?value*1000:value;const s=String(value||'').trim();if(!s)return 0;const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'+08:00':s;return Date.parse(iso)||0;}
function decode(payload){if(typeof payload!=='string')throw new Error('Invalid kiosk payload');return JSON.parse(gunzipSync(Buffer.from(payload,'base64'),{maxOutputLength:12*1024*1024}).toString('utf8'));}
function normalizeKiosk(raw,data,provider,now=Date.now()){
 const records=Array.isArray(raw)?raw:Object.values(raw||{});
 return records.flatMap(b=>{
  if(!b||b.provider!==provider||b.latitude==null||b.longitude==null)return [];
  const lat=Number(b.latitude),lon=Number(b.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<0||lat>8||lon<98||lon>120)return [];
  const route=matchRoute(b.route,data),timestamp=parseTime(b.dt_gps);const label=String(b.bus_no||'').trim();if(!label)return [];
  return [{id:label,label,routeId:route?.id||'live:'+publicNumber(b.route),routeNumber:route?.number||publicNumber(b.route)||'Unknown',rawRoute:String(b.route||''),direction:null,reportedDirection:b.dir??null,lat,lon,speed:b.speed!=null&&Number.isFinite(Number(b.speed))?Number(b.speed):null,bearing:b.angle!=null?Number(b.angle):null,timestamp,stale:!timestamp||now-timestamp>120000,source:'kiosk'}];
 });
}
const cached=new Map(),pending=new Map();
async function readKiosk(provider,fetcher=fetch){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);let sid;
 async function request(body){const params=new URLSearchParams({EIO:'4',transport:'polling',t:randomUUID()});if(sid)params.set('sid',sid);const r=await fetcher(BASE+'?'+params,{method:body===undefined?'GET':'POST',body,signal:controller.signal,headers:{'User-Agent':'JomNaik/2.1','Content-Type':'text/plain;charset=UTF-8'}});if(!r.ok)throw new Error('Kiosk feed unavailable');return r.text();}
 try{
  const open=await request();if(!open.startsWith('0'))throw new Error('Unexpected kiosk handshake');sid=JSON.parse(open.slice(1)).sid;if(typeof sid!=='string')throw new Error('Missing kiosk session');
  await request('40');
  let ack=await request();if(!ack.split('\x1e').some(f=>f.startsWith('40')))throw new Error('Kiosk did not acknowledge session');
  await request('42'+JSON.stringify(['onFts-reload',{sid:randomUUID().replace(/-/g,''),uid:'',provider,route:''}]));
  for(let i=0;i<4;i++){
   const frames=(await request()).split('\x1e');
   for(const frame of frames){if(frame==='2'){await request('3');continue;}if(frame.startsWith('42')){const event=JSON.parse(frame.slice(2));if(event[0]==='onFts-client')return decode(event[1]);}}
  }
  throw new Error('No kiosk vehicle snapshot');
 }finally{
  clearTimeout(timer);controller.abort();
  // Close Engine.IO session using a separate short-lived request, including on timeout.
  if(sid)try{await fetcher(BASE+'?'+new URLSearchParams({EIO:'4',transport:'polling',sid}),{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8','User-Agent':'JomNaik/2.1'},body:'1',signal:AbortSignal.timeout(1000)});}catch{}
 }
}
async function kioskSnapshot(provider){const old=cached.get(provider);if(old&&Date.now()-old.fetchedAt<15000)return old;if(pending.has(provider))return pending.get(provider);const job=readKiosk(provider).then(raw=>{const result={raw,fetchedAt:Date.now()};cached.set(provider,result);return result;});pending.set(provider,job);try{return await job;}finally{pending.delete(provider);}}
module.exports={parseTime,decode,normalizeKiosk,readKiosk,kioskSnapshot};

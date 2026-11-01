const fs = require('node:fs');
const path = require('node:path');
const categories = ['rapid-bus-kl','rapid-bus-mrtfeeder','rapid-bus-penang'];
const memory = new Map();
function category(req) { const c = req.query.category || 'rapid-bus-kl'; if (!categories.includes(c)) throw Object.assign(new Error('Unsupported network'),{status:400}); return c; }
function rawDataset(c) { if(!memory.has(c)) { const p=path.join(__dirname,'../data',c+'.json'); if(!fs.existsSync(p)) throw Object.assign(new Error('This network’s route data is unavailable. Please try another network.'),{status:503}); memory.set(c,JSON.parse(fs.readFileSync(p,'utf8'))); } return memory.get(c); }
function handle(fn) { return async(req,res)=>{ res.setHeader('X-Content-Type-Options','nosniff'); if(req.method!=='GET') {res.setHeader('Allow','GET'); return res.status(405).json({error:'Method not allowed'});} try {await fn(req,res);} catch(e){res.setHeader('Cache-Control','no-store');res.status(e.status||502).json({error:e.status?e.message:'Live data is temporarily unavailable. Please retry shortly.'});} }; }
function dataset(c) {
 const base=rawDataset(c);if(c==='rapid-bus-penang')return base;
 const feeds=[rawDataset('rapid-bus-kl'),rawDataset('rapid-bus-mrtfeeder')];
 const routes=[...new Map(feeds.flatMap(d=>d.routes).map(r=>[r.id,r])).values()];
 const t568=routes.find(r=>r.number==='T568');if(t568){t568.aliases=[...new Set([...(t568.aliases||[]),'T5680','T5681'])];t568.kioskId='1039';}else routes.push(require('../data/t568-osm.json'));
 return {...base,routes,tripIndex:Object.assign({},...feeds.map(d=>d.tripIndex))};
}
module.exports={categories,category,dataset,handle};

// Public numbers and operational route codes are different identifiers.
function token(value){return String(value??'').trim().toUpperCase().replace(/\s/g,'');}
function publicNumber(value){const id=token(value);if(/^U\d{4}$/.test(id))return id.slice(1,-1);if(/^[A-Z]+\d{4}$/.test(id))return id.slice(0,-1);return id;}
function matchRoute(value,data){const id=token(value);return data.routes.find(r=>token(r.id)===id||(r.aliases||[]).some(a=>token(a)===id))||data.routes.find(r=>token(r.number)===id)||data.routes.find(r=>token(r.number)===publicNumber(id));}
function vehicleKey(b){return token(b.label||b.id).replace(/[^A-Z0-9]/g,'');}
function mergeBuses(groups){const result=new Map();for(const buses of groups)for(const b of buses){const key=vehicleKey(b);const old=result.get(key);if(!old||b.timestamp>old.timestamp||(b.timestamp===old.timestamp&&b.source==='kiosk'))result.set(key,{...b,id:key});}return [...result.values()];}
module.exports={token,publicNumber,matchRoute,vehicleKey,mergeBuses};

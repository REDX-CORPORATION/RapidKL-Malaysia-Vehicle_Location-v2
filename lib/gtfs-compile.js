const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
function compile(buffer, category) {
  const zip = new AdmZip(buffer);
  const rows = name => { const entry = zip.getEntry(name + '.txt'); return entry ? parse(entry.getData().toString('utf8'), {columns:true, bom:true, skip_empty_lines:true, relax_column_count:true}) : []; };
  const stops = new Map(rows('stops').map(s => [s.stop_id, {id:s.stop_id,name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon)}]));
  const times = new Map();
  for (const t of rows('stop_times')) { if (!times.has(t.trip_id)) times.set(t.trip_id, []); times.get(t.trip_id).push(t); }
  const shapes = new Map();
  for (const s of rows('shapes')) { if(!shapes.has(s.shape_id)) shapes.set(s.shape_id, []); shapes.get(s.shape_id).push(s); }
  const trips = rows('trips'), tripIndex = {}, chosen = new Map();
  for(const t of trips) {
    tripIndex[t.trip_id] = [t.route_id, t.direction_id || '0'];
    // Penang realtime omits the static service prefix.
    const suffix = t.trip_id.slice(t.trip_id.indexOf('_')+1);
    if (category === 'rapid-bus-penang') tripIndex[suffix] = [t.route_id,t.direction_id || '0'];
    const key = t.route_id + ':' + (t.direction_id || '0');
    if ((times.get(t.trip_id)?.length || 0) > (times.get(chosen.get(key)?.trip_id)?.length || 0)) chosen.set(key,t);
  }
  const routes = rows('routes').map(r => ({id:r.route_id,number:r.route_short_name || r.route_id,name:r.route_long_name || r.route_short_name,directions:[...chosen.values()].filter(t => t.route_id===r.route_id).map(t => {
    const ordered = (times.get(t.trip_id)||[]).sort((a,b)=>Number(a.stop_sequence)-Number(b.stop_sequence)).map(s=>stops.get(s.stop_id)).filter(Boolean);
    const geometry = (shapes.get(t.shape_id)||[]).sort((a,b)=>Number(a.shape_pt_sequence)-Number(b.shape_pt_sequence)).map(s=>[Number(s.shape_pt_lat),Number(s.shape_pt_lon)]);
    return {id:t.direction_id||'0',name:t.trip_headsign || ordered.at(-1)?.name || 'Route direction',stops:ordered,geometry};
  })}));
  return {category,generatedAt:new Date().toISOString(),source:'Prasarana / data.gov.my',routes,tripIndex};
}
module.exports={compile};

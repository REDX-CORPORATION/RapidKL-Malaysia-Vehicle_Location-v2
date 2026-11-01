const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
for(const category of require('../lib/data').categories){const p=path.join(root,'data',category+'.json');if(!fs.existsSync(p)||!JSON.parse(fs.readFileSync(p)).routes.length)throw new Error('Missing route dataset: '+category+'. Run npm run refresh-data.');}
fs.mkdirSync(path.join(root,'public/vendor'),{recursive:true});fs.cpSync(path.join(root,'node_modules/leaflet/dist'),path.join(root,'public/vendor/leaflet'),{recursive:true});
fs.rmSync(path.join(root,'dist'),{recursive:true,force:true});fs.cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});console.log('Production static assets ready in dist; API functions remain in api/.');

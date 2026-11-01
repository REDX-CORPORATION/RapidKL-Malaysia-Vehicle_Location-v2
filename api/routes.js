const {category,dataset,handle}=require('../lib/data');
module.exports=handle(async(req,res)=>{const data=dataset(category(req));res.setHeader('Cache-Control','public, s-maxage=3600');res.json({category:data.category,generatedAt:data.generatedAt,source:data.source,routes:data.routes.map(({directions,...r})=>({...r,stopCount:directions[0]?.stops.length??null}))});});

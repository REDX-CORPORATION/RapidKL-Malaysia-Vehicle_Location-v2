// Local dev server: same handlers as Vercel's /api, plus static files from /public.
const express = require('express');
const path = require('path');

const app = express();
app.disable('x-powered-by');
const wrap = (h) => async (req, res) => {
  try { await h(req, res); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

app.get('/api/buses',  wrap(require('./api/buses')));
app.get('/api/routes', wrap(require('./api/routes')));
app.get('/api/shapes', wrap(require('./api/shapes')));
app.get('/api/line',   wrap(require('./api/line')));
app.get('/api/health', wrap(require('./api/health')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const port = process.env.PORT || 4040;
app.listen(port, () => console.log('jomnaik local dev -> http://localhost:' + port));

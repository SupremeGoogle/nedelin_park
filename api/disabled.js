// Заглушка — отдаёт 410 Gone для всех маршрутов, когда сайт временно отключён.
// Чтобы включить сайт обратно: убрать catch-all rewrite в vercel.json и redeploy.
export default function handler(_req, res) {
  res.status(410);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nedelin Park — временно недоступен</title>
<style>
  html,body{height:100%;margin:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#142419;color:#f4f0e6;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .wrap{max-width:420px}
  h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:34px;letter-spacing:.04em;margin:0 0 14px}
  p{font-size:15px;line-height:1.6;color:#cfd9cf;font-weight:300;margin:0}
  .dot{width:10px;height:10px;border-radius:50%;background:#b3955c;margin:0 auto 22px;box-shadow:0 0 18px rgba(179,149,92,.6)}
</style>
</head><body><div class="wrap">
  <div class="dot"></div>
  <h1>Сайт временно недоступен</h1>
  <p>Мы скоро вернёмся.</p>
</div></body></html>`);
}

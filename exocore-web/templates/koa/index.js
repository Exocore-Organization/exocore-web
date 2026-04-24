const Koa = require('koa');
const Router = require('@koa/router');
const app = new Koa();
const router = new Router();
const PORT = process.env.PORT || 3000;
router.get('/', (ctx) => { ctx.body = { message: 'Exocore Koa', status: 'running' }; });
app.use(router.routes());
app.listen(PORT, '0.0.0.0', () => console.log(`Koa running on http://0.0.0.0:${PORT}`));

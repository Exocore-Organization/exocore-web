import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.json({ message: 'Exocore Hono', status: 'running' }));
export default { port: process.env.PORT || 3000, fetch: app.fetch };

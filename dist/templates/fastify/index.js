const fastify = require('fastify')({ logger: true });
const PORT = process.env.PORT || 3000;
fastify.get('/', async () => ({ message: 'Exocore Fastify', status: 'running' }));
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => { if (err) process.exit(1); });

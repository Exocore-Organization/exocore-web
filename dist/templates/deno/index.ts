const PORT = parseInt(Deno.env.get('PORT') || '3000');
const handler = (_req: Request): Response =>
  Response.json({ message: 'Exocore Deno', status: 'running' });
console.log(`Deno server on port ${PORT}`);
await Deno.serve({ port: PORT }, handler);

const PORT = parseInt(process.env.PORT || '3000');
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    return Response.json({ message: 'Exocore Bun', status: 'running' });
  },
});
console.log(`Bun server running on port ${server.port}`);

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.get('/', (req, res) => res.json({ message: 'Exocore Express API', status: 'running' }));
app.listen(PORT, '0.0.0.0', () => console.log(`API running on http://0.0.0.0:${PORT}`));

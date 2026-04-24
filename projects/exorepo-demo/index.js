const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
 res.json({ message: 'Hello from Express API' });
});

app.get('/health', (req, res) => {
 res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Express API running on port ${PORT}`));
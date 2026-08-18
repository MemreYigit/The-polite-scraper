const express = require('express');

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).send('Health check passed');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
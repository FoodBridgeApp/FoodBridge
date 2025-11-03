import express from 'express';
import api from './routes/api.mjs';

const app = express();

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Mount API router
app.use('/api', api);

// Simple root just so we know server is up
app.get('/', (req, res) => {
  res.type('text').send('FoodBridge server up');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\FoodBridge server listening on \\);
});

export default app;
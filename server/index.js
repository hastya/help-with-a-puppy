const fs = require('fs');
const path = require('path');
const express = require('express');

// Minimal .env loader (avoids an extra dependency). Loads KEY=VALUE lines from
// a .env file in the project root if present; existing env vars take priority.
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1];
    let val = (m[2] || '').trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env) && val !== '') process.env[key] = val;
  }
})();

const { router: authRouter, authRequired } = require('./auth');
const { router: petsRouter } = require('./routes/pets');
const healthRouter = require('./routes/health');
const trainingRouter = require('./routes/training');
const nutritionRouter = require('./routes/nutrition');
const vetRouter = require('./routes/vet');
const expensesRouter = require('./routes/expenses');
const activityRouter = require('./routes/activity');
const settingsRouter = require('./routes/settings');
const reportsRouter = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// Lightweight request log
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Public auth endpoints
app.use('/api/auth', authRouter);

// Everything below requires a valid token
app.use('/api', authRequired);
app.use('/api', petsRouter); // /breeds, /pets, /pets/:petId
app.use('/api/pets/:petId/health', healthRouter);
app.use('/api/pets/:petId/training', trainingRouter);
app.use('/api/pets/:petId/nutrition', nutritionRouter);
app.use('/api/pets/:petId/activity', activityRouter);
app.use('/api/vet', vetRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);

// API 404 (must come before static SPA fallback)
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Static frontend + SPA fallback
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, () => {
  console.log(`🐶 Help with a puppy — сервер запущен на http://localhost:${PORT}`);
});

module.exports = app;

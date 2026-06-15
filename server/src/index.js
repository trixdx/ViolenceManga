import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pingDb } from './db.js';
import authRoutes from './routes/auth.js';
import stateRoutes from './routes/state.js';
import imgProxyRoutes from './routes/imgProxy.js';

const app = express();

app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    const db = await pingDb();
    res.json({ ok: true, db: !!db });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/state', stateRoutes);
app.use('/api/img-proxy', imgProxyRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(config.port, () => {
  if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret') {
    console.error('JWT_SECRET must be set in production');
    process.exit(1);
  }
  console.log(`Violence API → http://localhost:${config.port}`);
});

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { loadState, saveState } from '../services/stateService.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const state = await loadState(req.userId);
    if (!state) return res.status(404).json({ error: 'Profile not found' });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', authMiddleware, async (req, res) => {
  try {
    await saveState(req.userId, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

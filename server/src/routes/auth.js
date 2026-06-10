import { Router } from 'express';
import {
  registerUser, loginUser, findUserById, publicUser,
} from '../services/authService.js';
import { setAuthCookie, clearAuthCookie, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { login, email, password, passwordConfirm, guestState } = req.body || {};
    if (!login?.trim()) return res.status(400).json({ error: 'Введите логин' });
    if (!email?.trim()) return res.status(400).json({ error: 'Введите email' });
    if (!password) return res.status(400).json({ error: 'Введите пароль' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
    if (password !== passwordConfirm) return res.status(400).json({ error: 'Пароли не совпадают' });

    const user = await registerUser({ login, email, password, guestState });
    setAuthCookie(res, user.UserId);
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier?.trim()) return res.status(400).json({ error: 'Введите логин или email' });
    if (!password) return res.status(400).json({ error: 'Введите пароль' });

    const user = await loginUser(identifier, password);
    setAuthCookie(res, user.UserId);
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'User not found' });
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

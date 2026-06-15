import { Router } from 'express';
import { isAllowedImageUrl, streamImage } from '../utils/imageProxy.js';

const router = Router();

router.get('/', (req, res) => {
  const target = req.query.url;
  if (!target || !isAllowedImageUrl(target)) {
    res.status(400).end('Invalid url');
    return;
  }

  const upstream = streamImage(target, res);
  req.on('close', () => upstream.destroy());
});

export default router;

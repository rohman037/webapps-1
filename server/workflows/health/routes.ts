import { Router, Request, Response } from 'express';
import { testFirestoreHealth } from '@/src/db/dbService';

export const healthRouter = Router();

healthRouter.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

healthRouter.get(['/api/health/firestore', '/api/db-health'], async (_req: Request, res: Response) => {
  const health = await testFirestoreHealth();
  if (health.ok) {
    res.json(health);
  } else {
    res.status(health.status === 'PERMISSION_DENIED' ? 403 : 500).json(health);
  }
});

import { Router } from 'express';
import { requireAuth, requireAdminRole } from '@/src/middleware/auth';
import {
  getQrisConfigController,
  updateQrisConfigController,
  getTransactionsController,
  createTransactionController,
  submitProofController,
  approveTransactionController,
  rejectTransactionController,
} from './controller';

export const paymentRouter = Router();

// QRIS endpoints
paymentRouter.get(['/api/qris', '/api/admin/qris'], getQrisConfigController);
paymentRouter.post('/api/admin/qris', requireAuth, requireAdminRole, updateQrisConfigController);

// Transactions endpoints
paymentRouter.get('/api/transactions', getTransactionsController);
paymentRouter.post('/api/transactions', createTransactionController);
paymentRouter.post('/api/transactions/proof', submitProofController);
paymentRouter.post('/api/transactions/approve', approveTransactionController);
paymentRouter.post('/api/transactions/reject', rejectTransactionController);

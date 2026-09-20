import { Router } from 'express';
import { requireAuth, requireAdminRole } from '@/src/middleware/auth';
import {
  getContactSettingsController,
  updateContactSettingsController,
  getUsageSummaryController,
  exportBackupController,
  restoreBackupController,
  getHistoryController,
  saveHistoryController,
  deleteHistoryController,
} from './controller';

export const settingsRouter = Router();

// Contact Settings
settingsRouter.get(['/api/contact-settings', '/api/admin/contact-settings'], getContactSettingsController);
settingsRouter.post('/api/admin/contact-settings', requireAuth, requireAdminRole, updateContactSettingsController);

// Analytics Usage Summary
settingsRouter.get('/api/analytics/usage-summary', getUsageSummaryController);

// System Backup & Restore
settingsRouter.get('/api/system/export-backup', exportBackupController);
settingsRouter.post('/api/system/restore-backup', restoreBackupController);

// History
settingsRouter.get('/api/history', getHistoryController);
settingsRouter.post('/api/history', saveHistoryController);
settingsRouter.delete('/api/history/:id', deleteHistoryController);

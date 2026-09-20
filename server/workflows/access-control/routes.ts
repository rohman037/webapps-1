import { Router } from 'express';
import { requireAuth, requireAdminRole } from '@/src/middleware/auth';
import {
  getPackagesController,
  updatePackagesController,
  getAccessCodesController,
  createAccessCodeController,
  removeAccessCodeController,
  getAuditLogsController,
  createAuditLogController,
  checkBannedController,
  reportViolationController,
  getBannedDevicesController,
  banDeviceManualController,
  unbanDeviceController,
  stopActiveGenerationController,
  heartbeatController,
  getPresenceController,
  verifyAccessCodeController,
  logoutController,
  getClientsController,
  updateClientsController,
} from './controller';

export const accessControlRouter = Router();

// Packages
accessControlRouter.get('/api/packages', getPackagesController);
accessControlRouter.post('/api/admin/packages', requireAuth, requireAdminRole, updatePackagesController);

// Access Codes
accessControlRouter.get('/api/access-codes', getAccessCodesController);
accessControlRouter.post('/api/access-codes', createAccessCodeController);
accessControlRouter.post('/api/access-codes/remove', removeAccessCodeController);

// Audit Logs
accessControlRouter.get('/api/admin/audit-logs', getAuditLogsController);
accessControlRouter.post('/api/admin/audit-logs', createAuditLogController);

// Security & Banned Devices
accessControlRouter.post('/api/security/check-banned', checkBannedController);
accessControlRouter.post('/api/security/report-violation', reportViolationController);
accessControlRouter.get('/api/admin/banned-devices', requireAuth, requireAdminRole, getBannedDevicesController);
accessControlRouter.post('/api/admin/banned-devices', requireAuth, requireAdminRole, banDeviceManualController);
accessControlRouter.post('/api/admin/banned-devices/unban', requireAuth, requireAdminRole, unbanDeviceController);

// Active Generations Force-Stop
accessControlRouter.post('/api/admin/active-generations/stop', requireAuth, requireAdminRole, stopActiveGenerationController);

// Presence & Heartbeat
accessControlRouter.post('/api/presence/heartbeat', heartbeatController);
accessControlRouter.get('/api/admin/presence', getPresenceController);

// Verification & Authentication
accessControlRouter.post('/api/verify-access-code', verifyAccessCodeController);
accessControlRouter.post('/api/logout', logoutController);

// Clients
accessControlRouter.get(['/api/clients', '/api/admin/clients'], requireAuth, requireAdminRole, getClientsController);
accessControlRouter.post('/api/admin/clients', requireAuth, requireAdminRole, updateClientsController);

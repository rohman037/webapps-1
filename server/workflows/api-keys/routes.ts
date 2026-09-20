import { Router } from 'express';
import { requireAuth, requireAdminRole } from '@/src/middleware/auth';
import {
  getApiKeysController,
  updateApiKeysController,
  getApiKeyLogsController,
  addApiKeyLogController,
  getModelPrioritiesController,
  updateModelPrioritiesController,
  getLlmGatewayMetricsController,
  getLlmGatewayHealthController,
  testGeminiKeyController,
  pollAllApiKeysController,
} from './controller';

export const apiKeysRouter = Router();

// API Keys Pool Management
apiKeysRouter.get(['/api/apikeys', '/api/admin/apikeys'], getApiKeysController);
apiKeysRouter.post(['/api/apikeys', '/api/admin/apikeys'], updateApiKeysController);

// API Keys Logs
apiKeysRouter.get(['/api/apikeys/logs', '/api/admin/apikeys/logs'], getApiKeyLogsController);
apiKeysRouter.post(['/api/apikeys/logs', '/api/admin/apikeys/logs'], addApiKeyLogController);

// Model Routing & Priorities
apiKeysRouter.get(['/api/model-priorities', '/api/admin/model-priorities'], getModelPrioritiesController);
apiKeysRouter.post(['/api/model-priorities', '/api/admin/model-priorities'], requireAuth, requireAdminRole, updateModelPrioritiesController);

// Centralized LLM Gateway Metrics & Health
apiKeysRouter.get('/api/llm-gateway/metrics', getLlmGatewayMetricsController);
apiKeysRouter.get('/api/llm-gateway/health', getLlmGatewayHealthController);

// Key Testing & Health Probes
apiKeysRouter.post('/api/test-gemini-key', testGeminiKeyController);
apiKeysRouter.post('/api/admin/apikeys/poll-all', pollAllApiKeysController);

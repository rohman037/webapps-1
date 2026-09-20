import { Router } from 'express';
import { geminiGenerateController } from './controller';

export const geminiProxyRouter = Router();

// Secure Backend Gemini Proxy Endpoint
geminiProxyRouter.post('/api/gemini/generate', geminiGenerateController);

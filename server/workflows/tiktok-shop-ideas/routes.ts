import { Router } from 'express';
import { aiGenerationRateLimiter } from '@/server/middleware/rateLimit.middleware';
import { generateTikTokShopIdeasController } from './controller';

export const tiktokShopIdeasRouter = Router();

// API endpoint for TikTok Shop to Content Ideas Generator
tiktokShopIdeasRouter.post('/api/generate-tiktok-shop-ideas', aiGenerationRateLimiter, generateTikTokShopIdeasController);
tiktokShopIdeasRouter.post('/api/tiktok-shop-ideas', aiGenerationRateLimiter, generateTikTokShopIdeasController);


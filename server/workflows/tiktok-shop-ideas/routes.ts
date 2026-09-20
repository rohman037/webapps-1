import { Router } from 'express';
import { generateTikTokShopIdeasController } from './controller';

export const tiktokShopIdeasRouter = Router();

// API endpoint for TikTok Shop to Content Ideas Generator
tiktokShopIdeasRouter.post('/api/generate-tiktok-shop-ideas', generateTikTokShopIdeasController);

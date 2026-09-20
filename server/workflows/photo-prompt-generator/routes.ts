import { Router } from 'express';
import { generatePhotoPromptController } from './controller';

export const photoPromptRouter = Router();

// API endpoint for Image / Photo Analysis & AI Image Prompt Generation
photoPromptRouter.post('/api/generate-photo-prompt', generatePhotoPromptController);

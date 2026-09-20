import { Router } from 'express';
import { transcribeAudioController } from './controller';

export const transcribeAudioRouter = Router();

// API endpoint for Audio Transcription using Gemini
transcribeAudioRouter.post('/api/transcribe-audio', transcribeAudioController);

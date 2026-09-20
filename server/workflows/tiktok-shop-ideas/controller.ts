import { Request, Response } from 'express';
import {
  extractClientAccessCode,
  getClientInfoByCode,
  activeGenerationsMap,
  broadcastLiveEvent,
  sseClients,
} from '@/server/core/state/serverState';
import { generateTikTokShopIdeasService } from './service';
import { logger } from '@/src/utils/logger';

export async function generateTikTokShopIdeasController(req: Request, res: Response) {
  const clientAccessCode = extractClientAccessCode(req);
  const clientInfo = await getClientInfoByCode(clientAccessCode);

  const {
    shopUrl = '',
    productDetails = '',
    numIdeas = 3,
    totalDuration = '60',
    promptSplitSec = '10',
    aeoTargetMode = 'both',
    enableBigSound = true,
    enableTextOverlay = true,
    analysisMode = 'deep',
    referenceImageBase64 = '',
    referenceImageMimeType = '',
    model,
  } = req.body || {};

  const trimmedShopUrl = typeof shopUrl === 'string' ? shopUrl.trim() : '';

  if (!trimmedShopUrl && !referenceImageBase64) {
    return res.status(400).json({ error: 'Link TikTok Shop wajib diisi (atau unggah foto produk).' });
  }

  const taskId = req.body.taskId || `gen_shop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const activeTask: any = {
    id: taskId,
    clientId: clientAccessCode,
    accessCode: clientAccessCode,
    clientName: clientInfo.name,
    tool: 'TikTok Shop Ideas',
    status: 'generating',
    category: req.body.category || 'tiktok_shop',
    startedAt: new Date().toISOString(),
    updatedAt: Date.now(),
    progress: 5,
  };
  activeGenerationsMap.set(taskId, activeTask);

  broadcastLiveEvent({
    type: 'active_status_update',
    activeGenerations: Array.from(activeGenerationsMap.values()),
    activeUserCount: sseClients.size,
  });

  try {
    const customApiKey = (req.headers['x-custom-api-key'] as string) || req.body.customApiKey;

    const output = await generateTikTokShopIdeasService({
      shopUrl: trimmedShopUrl,
      productDetails,
      numIdeas,
      totalDuration,
      promptSplitSec,
      aeoTargetMode,
      enableBigSound,
      enableTextOverlay,
      analysisMode,
      referenceImageBase64,
      referenceImageMimeType,
      model,
      customApiKey,
      clientAccessCode,
      onProgress: (progress) => {
        activeTask.progress = progress;
        activeTask.updatedAt = Date.now();
        activeGenerationsMap.set(taskId, activeTask);
        broadcastLiveEvent({
          type: 'active_status_update',
          activeGenerations: Array.from(activeGenerationsMap.values()),
          activeUserCount: sseClients.size,
        });
      },
    });

    activeTask.status = 'completed';
    activeTask.updatedAt = Date.now();
    activeGenerationsMap.set(taskId, activeTask);

    broadcastLiveEvent({
      type: 'active_status_update',
      activeGenerations: Array.from(activeGenerationsMap.values()),
      activeUserCount: sseClients.size,
    });

    setTimeout(() => {
      activeGenerationsMap.delete(taskId);
      broadcastLiveEvent({
        type: 'active_status_update',
        activeGenerations: Array.from(activeGenerationsMap.values()),
        activeUserCount: sseClients.size,
      });
    }, 120000);

    return res.json(output);
  } catch (err: any) {
    logger.error('TikTok Shop Ideas generation error:', err);
    activeTask.status = 'failed';
    activeTask.updatedAt = Date.now();
    activeGenerationsMap.set(taskId, activeTask);

    broadcastLiveEvent({
      type: 'active_status_update',
      activeGenerations: Array.from(activeGenerationsMap.values()),
      activeUserCount: sseClients.size,
    });

    setTimeout(() => {
      activeGenerationsMap.delete(taskId);
      broadcastLiveEvent({
        type: 'active_status_update',
        activeGenerations: Array.from(activeGenerationsMap.values()),
        activeUserCount: sseClients.size,
      });
    }, 5000);

    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message || 'Gagal menganalisis produk TikTok Shop.' });
  }
}

import cron from 'node-cron';
import { dbGetApiKeys, dbGetClients, dbGetTransactions, dbGetGrowthState } from '@/src/db/dbService';
import { runAutoAgentFactory } from '@/platform_intelligence/agents/agentAutoAgentFactory';
import { analyzeUserGrowth } from '@/platform_intelligence/agents/agentUserGrowthAnalyst';
import { optimizeCostAndTiers } from '@/platform_intelligence/agents/agentCostTierOptimizer';
import { broadcastLiveEvent } from '@/server/core/state/serverState';
import { logger } from '@/src/utils/logger';

let cronInitialized = false;

export function initBackgroundSchedulers() {
  if (cronInitialized) return;
  cronInitialized = true;

  logger.info('[Server Schedulers] Initializing 24/7 autonomous agents cron jobs...');

  // 1. Hourly Cost & Model Tier Optimizer (At minute 0)
  cron.schedule('0 * * * *', async () => {
    try {
      const keysArr = await dbGetApiKeys();
      await optimizeCostAndTiers(keysArr);
    } catch (e) {
      logger.warn('[Cron Hourly Cost] Gagal menjalankan optimizer cost', e);
    }
  });

  // 2. Daily User Growth Analyst Cron (00:00)
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Server Cron 24/7] Running Daily User Growth Analyst...');
    try {
      const clients = await dbGetClients();
      const transactions = await dbGetTransactions();
      await analyzeUserGrowth(clients, transactions);
    } catch (e) {
      logger.warn('[Cron Daily Growth] Gagal menjalankan growth analyst', e);
    }
  });

  // 3. Daily Meta-Agent Auto-Factory Cron (00:05)
  cron.schedule('5 0 * * *', async () => {
    logger.info('[Server Cron 24/7] Running Daily Meta-Agent Auto-Factory...');
    try {
      const clients = await dbGetClients();
      const transactions = await dbGetTransactions();
      const factoryResult = await runAutoAgentFactory(clients, transactions);
      if (factoryResult?.scalingDecisions && factoryResult.scalingDecisions.length > 0) {
        broadcastLiveEvent({
          type: 'growth_scaling_updated',
          growthState: await dbGetGrowthState(),
        });
      }
    } catch (e) {
      logger.warn('[Cron Daily Factory] Gagal menjalankan agent factory', e);
    }
  });
}

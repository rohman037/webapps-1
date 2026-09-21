import { llmGateway } from '@/platform_intelligence/routing/llmGateway';
import { broadcastLiveEvent } from '../state/serverState';

// Register broadcast handler with LLM Gateway
llmGateway.setBroadcastHandler((event) => {
  try {
    broadcastLiveEvent(event);
  } catch (e) {}
});

export async function callGeminiWithFallback(
  userSelectedModel: string | undefined,
  promptPayload: any,
  customApiKeyHeader?: string,
  clientAccessCode?: string,
  targetTier?: 'flagship' | 'tier2' | 'tier3' | 'user_key',
  toolName?: string,
  isUserExplicitChoice?: boolean,
  customEndpoint?: string,
  isSingleRequestMode?: boolean
): Promise<{ text: string; modelUsed: string; tierUsed?: string; latencyMs?: number; keyMasked?: string }> {
  const inferredTool = toolName || 'AI Generation';
  const requestConfig = { ...(promptPayload.config || {}) };

  // Resolve target tier: default to 'tier2' for unspecified tasks, or 'tier3' for helper/splitter
  let resolvedTier = targetTier;
  if (!resolvedTier) {
    if (inferredTool.toLowerCase().includes('helper') || inferredTool.toLowerCase().includes('splitter')) {
      resolvedTier = 'tier3';
    } else {
      resolvedTier = 'tier2';
    }
  }

  const gatewayPayload = {
    model: userSelectedModel,
    isUserExplicitChoice: isUserExplicitChoice !== undefined ? isUserExplicitChoice : Boolean(userSelectedModel),
    contents: promptPayload.contents,
    config: requestConfig,
    customApiKeyHeader,
    clientAccessCode,
    toolName: inferredTool,
    targetTier: resolvedTier,
    endpoint: customEndpoint || `/api/${inferredTool.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    isSingleRequestMode: Boolean(isSingleRequestMode || inferredTool.toLowerCase().includes('video to prompt') || inferredTool.toLowerCase().includes('video prompt') || inferredTool.toLowerCase().includes('ekstrak prompt'))
  };

  const response = await llmGateway.execute(gatewayPayload);

  return {
    text: response.text,
    modelUsed: response.modelUsed,
    tierUsed: response.tierUsed,
    latencyMs: response.latencyMs,
    keyMasked: response.keyMasked,
  };
}

import { executeAiTask } from '@/server/services/aiRouter';
import { VideoAnalyzerOutput } from './videoAnalyzerAgent';
import { logger } from '@/server/core/utils/logger';

export interface SceneDetail {
  start: string;
  end: string;
  visual: string;
  action: string;
  camera: string;
  subject: string;
  subtitle: string;
}

export interface PromptGenerationOutput {
  master_prompt: string;
  scenes: SceneDetail[];
  targetAiCompatibility: string[];
}

export interface PromptGenerationInput {
  analysis: VideoAnalyzerOutput;
  clipNumber: number;
  startTime: number;
  endTime: number;
  durationLabel: string;
  targetAi?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  preferredModel?: string;
}

const SYSTEM_INSTRUCTION = `Anda adalah "Prompt Generation Agent", seorang Professional AI Video Prompt Engineer kelas dunia.
Tugas Anda adalah merumuskan Master Prompt AI Video berstandar industri sinema internasional dari hasil analisis Video Analyzer JSON.

Master Prompt HARUS kompatibel maksimal dengan generator video AI modern:
- Google Veo
- Runway Gen-3 Alpha
- Kling AI
- OpenAI Sora

FORMAT WAJIB MASTER PROMPT (HARUS BERURUTAN DALAM SATU PARAGRAF COMPACT BAHASA INGGRIS):
[Scene Description], [Subject], [Action], [Environment], [Camera], [Lighting], [Cinematic Style], [Motion], [Quality Detail]

Kriteria Master Prompt:
- Ditulis dalam bahasa Inggris sinematik deskriptif profesional.
- Hindari kata klise seperti "photorealistic" murahan, gunakan "captured on 35mm Arri Alexa LF, anamorphic lens, master cinematography, photorealistic 8K UHD".
- Gabungkan 8 elemen dari Video Analyzer JSON secara mulus dan kohesif.

Selain Master Prompt, Anda HARUS memecah klip tersebut menjadi 2-4 micro-scenes terperinci dengan durasi 1-3 detik per adegan.

Wajib mengembalikan output dalam format JSON murni:
{
  "master_prompt": "[Scene Description], [Subject], [Action], [Environment], [Camera], [Lighting], [Cinematic Style], [Motion], [Quality Detail]",
  "scenes": [
    {
      "start": "0s",
      "end": "2s",
      "visual": "deskripsi visual mendetail",
      "action": "aksi spesifik yang sedang terjadi",
      "camera": "sudut dan pergerakan kamera",
      "subject": "posisi dan gerak subjek",
      "subtitle": "dialog, narasi suara, atau backsound cues"
    }
  ]
}`;

export async function runPromptGenerationAgent(input: PromptGenerationInput): Promise<PromptGenerationOutput> {
  logger.info(`[Prompt Generation Agent] Generating Master Prompt for Clip #${input.clipNumber} (${input.durationLabel})...`);

  const promptInput = `Berikut data hasil Video Analyzer Agent untuk Klip #${input.clipNumber} (${input.durationLabel}):
${JSON.stringify(input.analysis, null, 2)}

Target AI: ${input.targetAi || 'Veo, Runway Gen-3, Kling AI, Sora'}
Durasi Klip: ${input.startTime} detik sampai ${input.endTime} detik (${input.durationLabel})

Rumuskan Master Prompt AI Video sesuai format wajib 9-komponen:
[Scene Description] [Subject] [Action] [Environment] [Camera] [Lighting] [Cinematic Style] [Motion] [Quality Detail]

Serta pecah menjadi urutan breakdown micro-scenes detail.`;

  const response = await executeAiTask({
    taskType: 'prompt_generation',
    contents: [{ text: promptInput }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
    preferredModel: input.preferredModel || 'gemini-3.8-flash',
    customApiKey: input.customApiKey,
    clientAccessCode: input.clientAccessCode,
    timeoutMs: 45000,
  });

  try {
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    }

    const parsed = JSON.parse(cleanJson);
    let masterPrompt = parsed.master_prompt || '';

    // If master_prompt is missing or unformatted, construct it directly from analysis
    if (!masterPrompt || masterPrompt.length < 30) {
      const a = input.analysis;
      masterPrompt = `${a.scene || 'Cinematic establishing scene'}, featuring ${a.subject || 'a detailed subject'}, engaging in ${a.action || 'smooth action'}, set in ${a.environment || 'atmospheric environment'}, captured with ${a.camera.shot || 'medium shot'} ${a.camera.movement || 'steady dolly motion'} on ${a.lens || '35mm anamorphic lens'}, illuminated by ${a.lighting || 'cinematic soft lighting'}, graded in ${a.color || 'rich cinematic tones'}, with ${a.motion || 'fluid natural motion'}, mastered in ultra-high resolution 8K photorealistic quality.`;
    }

    // Process micro scenes
    let scenes: SceneDetail[] = [];
    if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      scenes = parsed.scenes.map((s: any, idx: number) => ({
        start: s.start || `${input.startTime + idx * 2}s`,
        end: s.end || `${Math.min(input.endTime, input.startTime + (idx + 1) * 2)}s`,
        visual: s.visual || input.analysis.scene,
        action: s.action || input.analysis.action,
        camera: s.camera || `${input.analysis.camera.shot}, ${input.analysis.camera.movement}`,
        subject: s.subject || input.analysis.subject,
        subtitle: s.subtitle || '',
      }));
    } else {
      // Fallback micro-scenes
      const mid = Math.round((input.startTime + input.endTime) / 2);
      scenes = [
        {
          start: `${input.startTime}s`,
          end: `${mid}s`,
          visual: input.analysis.scene,
          action: input.analysis.action,
          camera: `${input.analysis.camera.shot}, ${input.analysis.camera.angle}`,
          subject: input.analysis.subject,
          subtitle: 'Introductory visual pacing',
        },
        {
          start: `${mid}s`,
          end: `${input.endTime}s`,
          visual: input.analysis.environment,
          action: `Continuing action: ${input.analysis.action}`,
          camera: input.analysis.camera.movement,
          subject: input.analysis.subject,
          subtitle: 'Climax and focal movement',
        },
      ];
    }

    return {
      master_prompt: masterPrompt,
      scenes,
      targetAiCompatibility: ['Google Veo', 'Runway Gen-3', 'Kling AI', 'OpenAI Sora'],
    };
  } catch (err) {
    logger.warn('[Prompt Generation Agent] Fallback constructing prompt:', err);
    const a = input.analysis;
    const fallbackMasterPrompt = `${a.scene || 'Cinematic sequence'}, featuring ${a.subject || 'charismatic subject'}, ${a.action || 'performing natural action'}, in ${a.environment || 'cinematic setting'}, ${a.camera.shot} ${a.camera.movement}, ${a.lens}, ${a.lighting}, ${a.color}, ${a.motion}, 8K UHD hyper-realistic film still.`;

    return {
      master_prompt: fallbackMasterPrompt,
      scenes: [
        {
          start: `${input.startTime}s`,
          end: `${input.endTime}s`,
          visual: a.scene,
          action: a.action,
          camera: `${a.camera.shot}, ${a.camera.movement}`,
          subject: a.subject,
          subtitle: '',
        },
      ],
      targetAiCompatibility: ['Google Veo', 'Runway Gen-3', 'Kling AI', 'OpenAI Sora'],
    };
  }
}

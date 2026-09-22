import { executeAiTask } from '@/server/services/aiRouter';
import { logger } from '@/server/core/utils/logger';

export interface VideoAnalyzerOutput {
  scene: string;
  subject: string;
  action: string;
  environment: string;
  camera: {
    shot: string;
    angle: string;
    movement: string;
  };
  lens: string;
  lighting: string;
  color: string;
  style: string;
  motion: string;
  scenes?: Array<{
    start: string;
    end: string;
    visual: string;
    action: string;
    camera: string;
    subject: string;
    subtitle: string;
  }>;
}

export interface VideoAnalyzerInput {
  base64Data?: string;
  mimeType?: string;
  videoUrl?: string;
  clipNumber: number;
  startTime: number;
  endTime: number;
  durationLabel: string;
  sourceCaption?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  preferredModel?: string;
  overallContext?: string;
}

const SYSTEM_INSTRUCTION = `Anda adalah "Video Analyzer Agent", seorang Professional Cinematographer dan Video Analyst kelas dunia.
Tugas utama Anda adalah membedah adegan video pada rentang waktu/segmen tertentu secara mendalam, presisi, dan teknis sinematografi tingkat tinggi.

Anda HARUS menganalisis 8 elemen wajib:
1. Scene: lokasi spesifik, environment, atmosphere
2. Subject: manusia (deskripsi fisik, busana, ekspresi), produk, objek, karakter
3. Action: aktivitas utama, interaksi antarsubjek, pergerakan dinamis
4. Camera: shot type (extreme wide, wide, medium close-up, macro), angle (eye level, low angle, dutch angle, high angle), movement (dolly in, pan left, orbit, tracking, steadycam, handheld)
5. Lens: focal length (misal: 35mm, 50mm, 85mm anomorphic), depth of field (f/1.4 shallow bokeh, deep focus), lens distortion
6. Lighting: sumber pencahayaan (key light, rim light, golden hour, neon backlight, softbox diffused), direction, mood
7. Color: palet warna (teal and orange, moody filmic desaturated, vibrant pastel, kodachrome film stock), visual tone
8. Motion: kecepatan gerak (normal 24fps, slow motion 60fps, dynamic whip pan), transisi adegan

Wajib mengembalikan output dalam format JSON murni TANPA markdown quote:
{
  "scene": "deskripsi detail lokasi dan atmosfer",
  "subject": "deskripsi detail subjek, pakaian, dan wujud",
  "action": "aktivitas dan pergerakan spesifik",
  "environment": "detail lingkungan dan latar belakang",
  "camera": {
    "shot": "jenis shot (cth: Medium Close-up)",
    "angle": "sudut kamera (cth: Eye-level slightly low)",
    "movement": "gerakan kamera (cth: Slow steady dolly in)"
  },
  "lens": "karakter lensa dan bokeh (cth: 50mm anamorphic prime lens, creamy shallow depth of field)",
  "lighting": "tata cahaya (cth: Soft warm diffused key light with subtle blue rim light)",
  "color": "palet warna dan grading (cth: Cinematic warm tones with rich dark shadows)",
  "style": "gaya visual (cth: Photorealistic cinematic commercial 8K)",
  "motion": "tempo dan pergerakan (cth: Smooth deliberate motion, natural 24fps filmic cadence)",
  "micro_scenes": [
    {
      "start": "0s",
      "end": "2s",
      "visual": "gambaran visual presisi",
      "action": "aksi yang terjadi",
      "camera": "posisi dan gerakan shot",
      "subject": "posisi subjek",
      "subtitle": "dialog, narasi, atau audio cues"
    }
  ]
}`;

export async function runVideoAnalyzerAgent(input: VideoAnalyzerInput): Promise<VideoAnalyzerOutput> {
  logger.info(`[Video Analyzer Agent] Analyzing Clip #${input.clipNumber} (${input.durationLabel})...`);

  const userPrompt = `Analisis segmen video berikut:
- Klip #${input.clipNumber} (${input.durationLabel})
- Rentang Detik: ${input.startTime}s sampai ${input.endTime}s
${input.sourceCaption ? `- Konteks/Caption Asli: "${input.sourceCaption}"` : ''}
${input.overallContext ? `- Konteks Keseluruhan Video: ${input.overallContext}` : ''}

Periksa secara visual dan audio (jika ada) adegan pada segmen ini. Berikan analisis lengkap dalam format JSON yang telah ditentukan.`;

  const contents: any[] = [];

  // If video data is available, pass it in contents
  if (input.base64Data && input.mimeType) {
    contents.push({
      inlineData: {
        mimeType: input.mimeType,
        data: input.base64Data,
      },
    });
  }

  contents.push({
    text: userPrompt,
  });

  const response = await executeAiTask({
    taskType: 'video_analysis',
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2, // Precise analysis
      responseMimeType: 'application/json',
    },
    preferredModel: input.preferredModel || 'gemini-3.8-flash',
    customApiKey: input.customApiKey,
    clientAccessCode: input.clientAccessCode,
    timeoutMs: 65000,
  });

  try {
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    }

    const parsed = JSON.parse(cleanJson);

    return {
      scene: parsed.scene || `Adegan pada klip ${input.durationLabel}`,
      subject: parsed.subject || 'Subjek utama dalam frame adegan',
      action: parsed.action || 'Pergerakan dinamis dalam frame',
      environment: parsed.environment || parsed.scene || 'Lingkungan adegan',
      camera: {
        shot: parsed.camera?.shot || 'Medium Shot',
        angle: parsed.camera?.angle || 'Eye Level',
        movement: parsed.camera?.movement || 'Smooth tracking camera',
      },
      lens: parsed.lens || '50mm cinematic prime lens, natural depth of field',
      lighting: parsed.lighting || 'Cinematic soft studio lighting, balanced contrast',
      color: parsed.color || 'Cinematic color graded, high dynamic range',
      style: parsed.style || 'Ultra-realistic 8K cinematic footage',
      motion: parsed.motion || 'Natural fluid motion, 24fps filmic pacing',
      scenes: parsed.micro_scenes || parsed.scenes || [],
    };
  } catch (parseErr) {
    logger.warn('[Video Analyzer Agent] Failed to parse strict JSON, falling back to structured defaults:', parseErr);
    return {
      scene: `Visual sinematik adegan pada ${input.durationLabel}`,
      subject: 'Subjek utama dengan ekspresi fokus dan gestur natural',
      action: 'Aksi terarah dengan pergerakan halus di dalam frame',
      environment: 'Latar sinematik dengan kedalaman ruang terisolasi',
      camera: {
        shot: 'Medium Cinematic Shot',
        angle: 'Eye Level Subtle Low Angle',
        movement: 'Slow forward dolly push',
      },
      lens: '35mm anamorphic lens, f/1.8 shallow depth of field',
      lighting: 'Warm key light with soft atmospheric fill and rim lighting',
      color: 'Rich cinematic color palette, balanced saturation',
      style: 'Ultra-photorealistic 8K cinematic footage',
      motion: 'Smooth stabilized motion cadence',
      scenes: [],
    };
  }
}

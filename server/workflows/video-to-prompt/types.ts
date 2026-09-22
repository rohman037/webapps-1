export interface VideoToPromptInput {
  // Input video (minimal 1)
  videoUrl?: string;
  videoFile?: string;              // base64
  mimeType?: string;
  videoDuration?: number;
  sourceTitle?: string;
  
  // Settings
  segmentDuration: 5 | 8 | 10 | 15 | "full" | number;
  targetAi: "veo" | "sora" | "runway" | "general" | string;
  aspectRatio: "9:16" | "16:9" | "1:1" | string;
  analysisDepth: "standard" | "deep" | string;
  customInstructions?: string;

  // Key & Access context
  model?: string;
  customApiKey?: string;
  clientAccessCode?: string;
  useCache?: boolean;
}

export interface MicroClip {
  timeRange: string;               // "0–2 detik"
  visual: string;
  aksi: string;
  suara: string | null;            // Voice over atau narasi
  subteks: string | null;          // Text overlay
}

export interface Segment {
  segmentIndex: number;
  timeRange: string;               // "0–10 detik"
  stageLabel: "HOOK" | "MASALAH" | "SOLUSI" | "DEMO" | "CTA" | "BENEFIT" | string;
  microClips: MicroClip[];
}

export interface ClipScene {
  start: string;
  end: string;
  visual: string;
  action: string;
  camera: string;
  subject: string;
  subtitle: string;
}

export interface VideoClipOutput {
  clip_number: number;
  start_time: number;
  end_time: number;
  master_prompt: string;
  scenes: ClipScene[];
}

export interface VideoToPromptOutput {
  // Output Data Structure matching Specification
  caption?: string;
  hashtags?: string[];              // 5 buah
  split_duration?: number | string;
  clips?: VideoClipOutput[];
  metadata?: {
    duration: string | number;
    total_clip: number;
    split_duration: string;
  };

  // Video meta
  videoMeta?: {
    duration: number;
    resolution: string;
    aspectRatio: string;
    fps: number;
    genre: string;
  };
  
  // Overall style
  overallStyle?: {
    mood: string;
    visualStyle: string;
    colorPalette: string[];
    lighting: string;
  };
  
  // Segmentasi
  segments?: Segment[];
  
  // Caption & Hashtag
  caption?: string;
  hashtags?: string[];              // 5 buah
  
  // Master prompt
  masterPrompt?: string;
  negativePrompt?: string;
  
  // Technical summary
  technicalSummary?: {
    totalSegments: number;
    totalMicroClips: number;
    avgMicroClipDuration: number;
    dominantShotType: string;
    cameraMovements: string[];
    aspectRatio: string;
    targetAi: string;
  };
  
  // Markdown output
  markdown: string;
  
  // Validation
  validation: {
    passed: boolean;
    score: number;
    failures: string[];
  };

  // Metadata
  meta: {
    apiCallsUsed: number;
    durationMs: number;
    warnings: string[];
    modelUsed?: string;
    tierUsed?: string;
  };
}

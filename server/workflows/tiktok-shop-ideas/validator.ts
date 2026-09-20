/**
 * Quality Validator for TikTok Shop Content Ideas (Rule-Based, Tanpa Gemini)
 * Memverifikasi integritas output: Bagian 1 & 3, Timeline detik, Visual & Aksi,
 * Bebas BGM, Sapaan 'kamu', Caption/Hashtag, Stage Labels, Production Notes, dll.
 */
export function validateShopIdeasOutput(rawText: string, hasAnchor: boolean): {
  status: 'passed' | 'rejected';
  score: number;
  failures: string[];
} {
  const failures: string[] = [];
  const text = rawText || '';

  const rules = [
    {
      id: 'C1',
      critical: true,
      name: 'Format 3 Bagian Resmi (Ada BAGIAN 1 & BAGIAN 3)',
      test: () => text.includes('BAGIAN 1') && text.includes('BAGIAN 3'),
    },
    {
      id: 'C2',
      critical: false,
      name: 'Minimal 1 Blok Ide Konten',
      test: () => /###\s*💡\s*IDE|\bIDE\s+\d+/i.test(text),
    },
    {
      id: 'C3',
      critical: true,
      name: 'Format Timeline Segmen Detik ([0–2s] atau X–Y detik)',
      test: () => /\[\d+(?:\.\d+)?\s*[–\-—]\s*\d+(?:\.\d+)?\s*s\]/i.test(text) || /\b\d+[\s–\-]+\d+\s*(?:detik|s)/i.test(text),
    },
    {
      id: 'C4',
      critical: true,
      name: 'Field Wajib Visual: dan Aksi:',
      test: () => /Visual\s*:/i.test(text) && /Aksi\s*:/i.test(text),
    },
    {
      id: 'C5',
      critical: false,
      name: 'Field Dialog (voice over: atau Subteks:)',
      test: () => /voice\s*over\s*:/i.test(text) || /subteks\s*:/i.test(text),
    },
    {
      id: 'C6',
      critical: true,
      name: 'Bebas dari BGM / Backsound / Musik Latar / Lagu',
      test: () => {
        const soundLines = text.match(/(?:-\s*)?Sound\s*:[^\n]+/gi) || [];
        for (const line of soundLines) {
          if (/\b(bgm|backsound|musik|music|lagu|backing\s*track)\b/i.test(line)) {
            if (/\b(?:tanpa|no|bebas|bukan|dilarang)\s+(?:bgm|backsound|musik|music|lagu|backing\s*track)\b/i.test(line)) {
              continue;
            }
            return false;
          }
        }
        return true;
      },
    },
    {
      id: 'C7',
      critical: false,
      name: 'Sapaan Orang Kedua "kamu" di Voice Over',
      test: () => /\bkamu\b/i.test(text),
    },
    {
      id: 'C8',
      critical: false,
      name: 'Tersedia Draft Caption atau Hashtag',
      test: () => /Caption/i.test(text) || /Hashtag/i.test(text) || /#[a-zA-Z0-9_]+/i.test(text),
    },
    {
      id: 'C9',
      critical: false,
      name: 'Jumlah Ide Sesuai Permintaan (minimal 1 ide lengkap)',
      test: () => (text.match(/###\s*💡\s*IDE|\bIDE\s+\d+/gi) || []).length >= 1,
    },
    {
      id: 'C10',
      critical: false,
      name: 'Struktur Stage / Stage Label (Hook/Pain/Demo/Benefit/CTA)',
      test: () => /(Stage\s*:|GOLDEN\s*HOOK|HOOK|PAIN|SOLUTION|DEMO|BENEFIT|PROOF|CTA)/i.test(text),
    },
    {
      id: 'C11',
      critical: false,
      name: 'Bebas Tag Bahasa Inggris [Style] [Camera] [Lighting]',
      test: () => !/\[(?:Style|Camera|Lighting)\]/i.test(text),
    },
    {
      id: 'C12',
      critical: false,
      name: 'Tersedia Field Production Note / Catatan Kamera',
      test: () => /Production\s*Note/i.test(text) || /Catatan\s*Produksi/i.test(text),
    },
    {
      id: 'C13',
      critical: false,
      name: 'Sound Berfokus pada SFX / Foley / Ambient / VO (Bukan Musik)',
      test: () => {
        const soundLines = text.match(/(?:-\s*)?Sound\s*:[^\n]+/gi) || [];
        for (const line of soundLines) {
          if (/\b(bgm|backsound|musik|music|lagu)\b/i.test(line)) {
            if (/\b(?:tanpa|no|bebas|bukan|dilarang)\s+(?:bgm|backsound|musik|music|lagu)\b/i.test(line)) {
              continue;
            }
            return false;
          }
        }
        return true;
      },
    },
    {
      id: 'C14',
      critical: false,
      name: 'Call To Action (CTA) ke Keranjang Kuning',
      test: () => /Call\s*To\s*Action|CTA|keranjang\s*kuning/i.test(text),
    },
    {
      id: 'C15',
      critical: false,
      name: 'Hook 3 Detik Pertama (0-3s)',
      test: () => /Hook\s*3\s*Detik|0[-–]3s/i.test(text),
    },
    {
      id: 'C16',
      critical: false,
      name: 'Text On Screen (TOS)',
      test: () => /Text\s*On\s*Screen|TOS/i.test(text),
    },
    {
      id: 'C17',
      critical: false,
      name: 'Integritas Produk (Konsistensi Anchor)',
      test: () => (!hasAnchor ? true : text.length > 500),
    },
  ];

  let passedRules = 0;
  let criticalBroken = false;

  for (const rule of rules) {
    if (rule.test()) {
      passedRules++;
    } else {
      failures.push(`[${rule.id}] ${rule.name}`);
      if (rule.critical) {
        criticalBroken = true;
      }
    }
  }

  const score = Math.round((passedRules / rules.length) * 100);
  const status: 'passed' | 'rejected' = (score >= 70 && !criticalBroken) ? 'passed' : 'rejected';

  return {
    status,
    score,
    failures,
  };
}

export function isNewClipFormat(text: string): boolean {
  if (!text) return false;
  const hasTimeLine =
    /\b\d+(?:[.,]\d+)?\s*[–\-—]\s*\d+(?:[.,]\d+)?\s*(?:detik|s|dtk)\b/i.test(text) ||
    /\[\d+(?:[.,]\d+)?\s*[–\-—]\s*\d+(?:[.,]\d+)?\s*s\]/i.test(text);
  const hasVisual = /Visual\s*:/i.test(text);
  const hasAksi = /Aksi\s*:/i.test(text);
  return hasTimeLine && hasVisual && hasAksi;
}

import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type {
  AIAnalysisResult,
  ComplaintCategory,
  DepartmentName,
  PriorityLevel,
  PredictionsResponse,
} from '../src/types/civic';

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const CATEGORY_TO_DEPARTMENT: Record<ComplaintCategory, DepartmentName> = {
  'Road Damage': 'Roads & Infrastructure',
  'Water Leakage': 'Water Supply & Drainage',
  'Sewage Overflow': 'Sewerage & Public Health',
  'Garbage Accumulation': 'Sanitation & Waste',
  'Streetlight Failure': 'Electrical & Streetlights',
  'Drainage Blockage': 'Water Supply & Drainage',
  Other: 'Municipal General Desk',
};

function heuristicAnalyze(params: {
  title: string;
  description: string;
  language?: string;
  existingComplaints: Array<{ tracking_id: string; title: string; category: string; ward: string; status: string }>;
}): AIAnalysisResult {
  const combined = `${params.title} ${params.description}`.toLowerCase();
  const hasKannada = /[\u0C80-\u0CFF]/.test(combined);

  let category: ComplaintCategory = 'Other';
  if (/sewage|manhole|sewer|foul|ಒಳಚರಂಡಿ|ಕೊಳಚೆ|ಮ್ಯಾನ್‌ಹೋಲ್/.test(combined)) {
    category = 'Sewage Overflow';
  } else if (/water|pipe|leak|main|valve|ನೀರು|ನೀರಿನ|ಪೈಪ್/.test(combined)) {
    category = 'Water Leakage';
  } else if (/garbage|waste|trash|bin|litter|ಕಸ/.test(combined)) {
    category = 'Garbage Accumulation';
  } else if (/light|lamp|pole|dark|street\s?light|ಬೀದಿ\s?ದೀಪ|ದೀಪ|ಕತ್ತಲೆ/.test(combined)) {
    category = 'Streetlight Failure';
  } else if (/drain|flood|stormwater|culvert|ಚರಂಡಿ/.test(combined)) {
    category = 'Drainage Blockage';
  } else if (/pothole|road|asphalt|crater|tarmac|ಗುಂಡಿ|ರಸ್ತೆ/.test(combined)) {
    category = 'Road Damage';
  }

  let priority: PriorityLevel = 'Medium';
  let urgencyScore = 62;
  if (/burst|critical|urgent|school|hospital|collapse|spark|electroc|overflow|ತೀವ್ರ|ಅಪಾಯ/.test(combined)) {
    priority = 'Critical';
    urgencyScore = 91;
  } else if (/deep|dark|days|blocked|skid|accident|major|ಹೆಚ್ಚು/.test(combined)) {
    priority = 'High';
    urgencyScore = 78;
  } else if (/minor|small/.test(combined)) {
    priority = 'Low';
    urgencyScore = 38;
  }

  const department = CATEGORY_TO_DEPARTMENT[category];
  const dup = params.existingComplaints.find(
    (c) =>
      c.status !== 'Resolved' &&
      c.category === category &&
      c.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .some((w) => combined.includes(w))
  );

  const suggestedDeadlineHours =
    priority === 'Critical' ? 24 : priority === 'High' ? 48 : priority === 'Medium' ? 72 : 120;

  return {
    category,
    department,
    priority,
    urgencyScore,
    summary: hasKannada
      ? `[Kannada Report] ${category} reported requiring ${department} inspection. Original note: ${params.title}`
      : `${category} issue flagged for ${department} dispatch: ${params.title}.`,
    detectedLanguage: hasKannada ? 'kn' : params.language || 'en',
    imageAnalysis: null,
    possibleDuplicateTrackingId: dup ? dup.tracking_id : null,
    duplicateReason: dup ? `Matches active ${dup.category} report ${dup.tracking_id} (${dup.ward}).` : null,
    suggestedDeadlineHours,
    confidence: 0.82,
    source: 'heuristic',
  };
}

export async function analyzeComplaintWithAI(params: {
  title: string;
  description: string;
  language?: string;
  ward?: string;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  existingComplaints: Array<{
    tracking_id: string;
    title: string;
    description: string;
    category: string;
    ward: string;
    status: string;
  }>;
}): Promise<AIAnalysisResult> {
  const ai = getGeminiClient();
  if (!ai) {
    return heuristicAnalyze(params);
  }

  try {
    const existingSummary = params.existingComplaints
      .slice(0, 15)
      .map(
        (c) =>
          `${c.tracking_id} | ${c.status} | ${c.category} | ${c.ward} | ${c.title}`
      )
      .join('\n');

    const promptText = `You are the CIVIC Municipal Triage & Grievance Intelligence engine.
Analyze the citizen complaint below (which may be in English, Kannada, or mixed script) and optional uploaded photo.

Citizen Report:
- Title: ${params.title}
- Description: ${params.description}
- Ward / Area: ${params.ward || 'Unspecified'}
- Selected UI Language: ${params.language || 'en'}

Active Open Complaints in Database (for duplicate detection):
${existingSummary || 'None'}

Tasks:
1. Classify into exact category: "Road Damage", "Water Leakage", "Sewage Overflow", "Garbage Accumulation", "Streetlight Failure", "Drainage Blockage", or "Other".
2. Recommend exact department: "Roads & Infrastructure", "Water Supply & Drainage", "Sanitation & Waste", "Electrical & Streetlights", "Sewerage & Public Health", or "Municipal General Desk".
3. Assign priority ("Critical", "High", "Medium", "Low") and urgencyScore (1 to 100).
4. Write a clear, concise 1-2 sentence executive summary in English (translating accurately if the complaint is in Kannada).
5. Detect the input language ("en", "kn", or "mixed").
6. If an image is provided, describe the exact civic issue visible in the image; otherwise return empty string.
7. Check if this matches any existing open complaint above by location/issue type; if so return its tracking_id and a brief reason, otherwise empty strings.
8. Suggest a realistic SLA deadline in hours (e.g., 12, 24, 48, 72).`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (params.imageBase64 && params.imageMimeType) {
      const cleanBase64 = params.imageBase64.includes(',')
        ? params.imageBase64.split(',')[1]
        : params.imageBase64;
      parts.push({
        inlineData: {
          mimeType: params.imageMimeType,
          data: cleanBase64,
        },
      });
    }
    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            department: { type: Type.STRING },
            priority: { type: Type.STRING },
            urgencyScore: { type: Type.INTEGER },
            summary: { type: Type.STRING },
            detectedLanguage: { type: Type.STRING },
            imageAnalysis: { type: Type.STRING },
            possibleDuplicateTrackingId: { type: Type.STRING },
            duplicateReason: { type: Type.STRING },
            suggestedDeadlineHours: { type: Type.INTEGER },
            confidence: { type: Type.NUMBER },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validCategories: ComplaintCategory[] = [
      'Road Damage',
      'Water Leakage',
      'Sewage Overflow',
      'Garbage Accumulation',
      'Streetlight Failure',
      'Drainage Blockage',
      'Other',
    ];
    const category: ComplaintCategory = validCategories.includes(parsed.category)
      ? parsed.category
      : heuristicAnalyze(params).category;

    const validDepts: DepartmentName[] = [
      'Roads & Infrastructure',
      'Water Supply & Drainage',
      'Sanitation & Waste',
      'Electrical & Streetlights',
      'Sewerage & Public Health',
      'Municipal General Desk',
    ];
    const department: DepartmentName = validDepts.includes(parsed.department)
      ? parsed.department
      : CATEGORY_TO_DEPARTMENT[category];

    const validPriorities: PriorityLevel[] = ['Critical', 'High', 'Medium', 'Low'];
    const priority: PriorityLevel = validPriorities.includes(parsed.priority)
      ? parsed.priority
      : 'Medium';

    return {
      category,
      department,
      priority,
      urgencyScore: Math.min(100, Math.max(10, Number(parsed.urgencyScore) || 65)),
      summary: parsed.summary || `${category} report routed to ${department}.`,
      detectedLanguage: parsed.detectedLanguage || params.language || 'en',
      imageAnalysis: parsed.imageAnalysis ? String(parsed.imageAnalysis) : null,
      possibleDuplicateTrackingId: parsed.possibleDuplicateTrackingId
        ? String(parsed.possibleDuplicateTrackingId)
        : null,
      duplicateReason: parsed.duplicateReason ? String(parsed.duplicateReason) : null,
      suggestedDeadlineHours: Math.max(6, Math.min(168, Number(parsed.suggestedDeadlineHours) || 48)),
      confidence: Math.min(0.99, Math.max(0.5, Number(parsed.confidence) || 0.91)),
      source: 'gemini',
    };
  } catch (err) {
    console.error('Gemini analyzeComplaint error, using heuristic fallback:', err);
    return heuristicAnalyze(params);
  }
}

export async function transcribeVoiceWithAI(params: {
  audioBase64: string;
  mimeType: string;
  language?: string;
}): Promise<{ transcript: string; source: 'gemini' | 'fallback' }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('Gemini API key is not configured for server-side audio transcription.');
  }

  const cleanBase64 = params.audioBase64.includes(',')
    ? params.audioBase64.split(',')[1]
    : params.audioBase64;

  const langHint =
    params.language === 'kn'
      ? 'The speaker may be speaking in Kannada or English. Transcribe accurately in the spoken script (Kannada or English).'
      : 'Transcribe this civic issue voice report accurately. It may be in English or Kannada.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: cleanBase64,
          },
        },
        { text: langHint },
      ],
    },
  });

  return {
    transcript: (response.text ?? '').trim(),
    source: 'gemini',
  };
}

export async function generateCivicPredictions(
  complaints: Array<{
    ward: string;
    category: string;
    status: string;
    priority: string;
    is_overdue: number;
    created_at: string;
  }>
): Promise<PredictionsResponse> {
  const wardCategoryCounts = new Map<string, { ward: string; category: string; total: number; open: number }>();
  for (const c of complaints) {
    const key = `${c.ward}__${c.category}`;
    const existing = wardCategoryCounts.get(key) || {
      ward: c.ward,
      category: c.category,
      total: 0,
      open: 0,
    };
    existing.total++;
    if (c.status !== 'Resolved') existing.open++;
    wardCategoryCounts.set(key, existing);
  }

  const topPatterns = Array.from(wardCategoryCounts.values())
    .sort((a, b) => b.open * 2 + b.total - (a.open * 2 + a.total))
    .slice(0, 6);

  const statisticalFallback: PredictionsResponse = {
    generatedAt: new Date().toISOString(),
    executiveBrief:
      'Historical ward clusters indicate heightened risk of stormwater drainage blockages, arterial road wear, and sewage trunk backups across high-density southern and eastern wards over the next 14 days.',
    predictions: topPatterns.slice(0, 4).map((p, idx) => ({
      ward: p.ward,
      category: p.category,
      riskLevel: idx === 0 ? 'High' : idx < 3 ? 'Elevated' : 'Moderate',
      likelihoodPercent: Math.min(92, 62 + p.open * 11 + p.total * 4),
      forecastWindow: 'Next 7–14 days',
      rationale: `${p.total} historical reports (${p.open} currently active) signal recurring infrastructure stress in ${p.ward}.`,
      recommendedAction: `Schedule preventive ${p.category.toLowerCase()} inspection and pre-position rapid response crew in ${p.ward}.`,
    })),
    source: 'statistical',
  };

  const ai = getGeminiClient();
  if (!ai) {
    return statisticalFallback;
  }

  try {
    const digest = topPatterns
      .map((p) => `${p.ward} | ${p.category} | total=${p.total} | active=${p.open}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Based on this civic grievance history digest across Bengaluru wards, forecast 4 likely near-term civic infrastructure issues and preventive municipal actions.

Data Digest:
${digest}

Total complaints analyzed: ${complaints.length}
Active overdue/escalated count: ${complaints.filter((c) => c.is_overdue === 1 || c.status === 'Escalated').length}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveBrief: { type: Type.STRING },
            predictions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ward: { type: Type.STRING },
                  category: { type: Type.STRING },
                  riskLevel: { type: Type.STRING },
                  likelihoodPercent: { type: Type.INTEGER },
                  forecastWindow: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                  recommendedAction: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    if (!Array.isArray(parsed.predictions) || parsed.predictions.length === 0) {
      return statisticalFallback;
    }

    return {
      generatedAt: new Date().toISOString(),
      executiveBrief: parsed.executiveBrief || statisticalFallback.executiveBrief,
      predictions: parsed.predictions.slice(0, 4).map((p: Record<string, unknown>) => ({
        ward: String(p.ward || 'Ward 151 · Koramangala'),
        category: String(p.category || 'Road Damage'),
        riskLevel:
          p.riskLevel === 'High' || p.riskLevel === 'Elevated' || p.riskLevel === 'Moderate'
            ? p.riskLevel
            : 'Elevated',
        likelihoodPercent: Math.min(96, Math.max(40, Number(p.likelihoodPercent) || 74)),
        forecastWindow: String(p.forecastWindow || 'Next 14 days'),
        rationale: String(p.rationale || ''),
        recommendedAction: String(p.recommendedAction || ''),
      })),
      source: 'gemini',
    };
  } catch (err) {
    console.error('Gemini predictions error, returning statistical fallback:', err);
    return statisticalFallback;
  }
}

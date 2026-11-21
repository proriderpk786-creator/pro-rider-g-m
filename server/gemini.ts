import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';

export function getGeminiClient(apiVersion: 'v1' | 'v1beta' = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing from the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export type ChatDepth = 'fast' | 'general' | 'deep';
export type AiPersona = 'passenger' | 'partner' | 'general';

export function buildSystemInstruction(persona: AiPersona, lang: 'en' | 'ur' = 'en'): string {
  const roleGuidance =
    persona === 'partner'
      ? 'You are PRO RIDER AI Partner Co-Pilot helping verified Pro Partner drivers in Pakistan with route efficiency, fuel savings, CNIC/licence compliance, PKR fare fairness, and trip workflow best practices.'
      : persona === 'passenger'
      ? 'You are PRO RIDER AI Passenger Travel Concierge helping riders in Pakistan choose between Go Now, Schedule, Pick & Drop, Ride Sharing, Fuel Sharing, and Monthly Packages, plus estimating travel tips.'
      : 'You are PRO RIDER AI Assistant — Pakistan smart mobility platform ("Travel with Trust").';

  const langRule =
    lang === 'ur'
      ? 'Respond fluently in clean Urdu script (اردو) when the user writes in Urdu or Roman Urdu, or match English if the user writes in English. NEVER use Hindi/Devanagari.'
      : 'Respond clearly and concisely in English or Urdu (when the user uses Urdu/Roman Urdu). Keep PKR amounts realistic for Pakistan.';

  return `${roleGuidance}\nOfficial Support WhatsApp: 03125007782. Currency: Pakistani Rupees (PKR / Rs.). Never reveal internal admin secrets or passwords.\n${langRule}`;
}

export async function runAiChat(params: {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  depth?: ChatDepth;
  persona?: AiPersona;
  lang?: 'en' | 'ur';
}) {
  const ai = getGeminiClient('v1beta');
  const depth = params.depth || 'general';
  // NOTE: Paid models (gemini-4-carbon / gemini-4-argon) are excluded per user choice;
  // map 'deep' cleanly to gemini-4-hydrogen + ThinkingLevel.HIGH and 'fast' to gemini-3.1-flash-lite.
  const model = depth === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

  const config: Record<string, any> = {
    systemInstruction: buildSystemInstruction(params.persona || 'general', params.lang || 'en'),
  };

  if (model === 'gemini-4-hydrogen') {
    config.thinkingConfig = {
      thinkingLevel: depth === 'deep' ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
    };
  }

  const chat = ai.chats.create({
    model,
    config,
    history: (params.history || []).slice(-16).map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
  });

  const response = await chat.sendMessage({ message: params.message });
  return {
    text: response.text || 'I could not generate a response right now. Please try again.',
    modelUsed: model,
    depth,
  };
}

export async function runMapsGrounding(params: {
  query: string;
  lat?: number;
  lng?: number;
  lang?: 'en' | 'ur';
}) {
  const ai = getGeminiClient('v1beta');
  const config: Record<string, any> = {
    tools: [{ googleMaps: {} }],
    systemInstruction: `You are PRO RIDER AI Local Places Guide powered by Google Maps grounding. Give accurate, helpful place suggestions and landmarks in Pakistan (${params.lang === 'ur' ? 'reply in Urdu script if appropriate' : 'English'}). Do not invent places or URLs.`,
  };

  if (typeof params.lat === 'number' && typeof params.lng === 'number' && Number.isFinite(params.lat) && Number.isFinite(params.lng)) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: params.lat,
          longitude: params.lng,
        },
      },
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: params.query,
    config,
  });

  const candidate = response.candidates?.[0];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const places: Array<{ title: string; uri: string; reviewSnippets?: string[] }> = [];

  for (const chunk of chunks as any[]) {
    if (chunk?.maps?.uri) {
      const snippets: string[] = [];
      const rawSnippets = chunk.maps.placeAnswerSources?.reviewSnippets;
      if (Array.isArray(rawSnippets)) {
        for (const s of rawSnippets.slice(0, 2)) {
          if (typeof s?.content === 'string') snippets.push(s.content);
          else if (typeof s === 'string') snippets.push(s);
        }
      }
      places.push({
        title: chunk.maps.title || 'Google Maps Location',
        uri: chunk.maps.uri,
        ...(snippets.length ? { reviewSnippets: snippets } : {}),
      });
    }
  }

  return {
    text: response.text || '',
    places,
  };
}

export async function runSearchGrounding(params: {
  query: string;
  lang?: 'en' | 'ur';
}) {
  const ai = getGeminiClient('v1beta');
  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: params.query,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: `You are PRO RIDER AI Live Travel & Fuel Analyst. Use Google Search grounding to answer with current real-world Pakistan fuel rates, road closures, traffic updates, weather, and commute insights. Be concise (${params.lang === 'ur' ? 'Urdu or English matching the query' : 'English'}).`,
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.query,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `You are PRO RIDER AI Live Travel & Fuel Analyst. Use Google Search grounding to answer with current real-world Pakistan fuel rates, road closures, traffic updates, weather, and commute insights. Be concise (${params.lang === 'ur' ? 'Urdu or English matching the query' : 'English'}).`,
        },
      });
    } else {
      throw err;
    }
  }

  const candidate = response.candidates?.[0];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const sources: Array<{ title: string; uri: string }> = [];
  const seen = new Set<string>();

  for (const chunk of chunks as any[]) {
    if (chunk?.web?.uri && !seen.has(chunk.web.uri)) {
      seen.add(chunk.web.uri);
      sources.push({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      });
    }
  }

  return {
    text: response.text || '',
    sources,
  };
}

export async function transcribeAudioBuffer(params: {
  base64Audio: string;
  mimeType: string;
  hintLang?: 'en' | 'ur';
}) {
  const ai = getGeminiClient('v1beta');
  const contents = {
    parts: [
      {
        inlineData: {
          mimeType: params.mimeType || 'audio/webm',
          data: params.base64Audio,
        },
      },
      {
        text:
          params.hintLang === 'ur'
            ? 'Transcribe this spoken audio accurately into Urdu script or English as spoken (never Devanagari/Hindi). Output only the clean transcript. If silent or unintelligible, return an empty string.'
            : 'Transcribe this spoken audio accurately. If the speaker speaks English or Urdu/Roman Urdu (e.g. Pakistan street names and sectors like F-10, Blue Area, Gulberg), transcribe clearly. Output only the clean transcript text. If silent or empty audio, return an empty string.',
      },
    ],
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents,
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.includes('404') || msg.includes('NOT_FOUND')) {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
      });
    } else {
      throw err;
    }
  }

  return {
    transcript: (response.text || '').trim(),
  };
}

export async function createLiveGeminiSession(params: {
  persona: AiPersona;
  lang: 'en' | 'ur';
  onAudio: (base64Pcm24k: string) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const ai = getGeminiClient('v1beta');
  const systemInstruction = `${buildSystemInstruction(params.persona, params.lang)} Keep spoken replies natural, warm, concise (2-4 sentences), and easy to listen to while travelling.`;

  const session = await ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
      systemInstruction,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onopen: () => {},
      onmessage: (message: any) => {
        const sc = message?.serverContent;
        if (!sc) return;

        if (sc.interrupted) {
          params.onInterrupted();
        }
        if (sc.inputTranscription?.text) {
          params.onInputTranscript(sc.inputTranscription.text);
        }
        if (sc.outputTranscription?.text) {
          params.onOutputTranscript(sc.outputTranscription.text);
        }
        const parts = sc.modelTurn?.parts || [];
        for (const part of parts) {
          if (part?.inlineData?.data && part?.inlineData?.mimeType?.includes('audio')) {
            params.onAudio(part.inlineData.data);
          }
        }
        if (sc.turnComplete) {
          params.onTurnComplete();
        }
      },
      onerror: (err: any) => {
        params.onError(err?.message || 'Live voice session error');
      },
      onclose: () => {
        params.onClose();
      },
    },
  });

  return session;
}

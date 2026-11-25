import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Compass,
  ExternalLink,
  Globe,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useFirebase, type GroundedPlace, type GroundedSource } from '../contexts/FirebaseContext';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n/translations';
import type { Language } from '../types';
import { apiRequest } from '../utils/api';
import { VoiceTranscribeButton } from './VoiceTranscribeButton';

type CopilotPersona = 'passenger' | 'partner' | 'general';
type CopilotTab = 'chat' | 'voice';
type GroundingTool = 'chat' | 'maps' | 'search';
type ReasoningDepth = 'fast' | 'general' | 'deep';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  mode: 'fast' | 'general' | 'deep' | 'maps' | 'search' | 'voice';
  places?: GroundedPlace[];
  sources?: GroundedSource[];
}

interface ProRiderAiCopilotProps {
  persona: CopilotPersona;
  lang: Language;
  currentCoords?: { lat: number; lng: number } | null;
  showFloatingOnMobile?: boolean;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function downsampleTo16kInt16(input: Float32Array, inputSampleRate: number): Int16Array {
  const targetRate = 16000;
  if (inputSampleRate === targetRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputSampleRate / targetRate;
  const newLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(newLen);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < out.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return out;
}

export const ProRiderAiCopilot: React.FC<ProRiderAiCopilotProps> = ({
  persona,
  lang,
  currentCoords = { lat: 33.6844, lng: 73.0479 },
  showFloatingOnMobile = false,
}) => {
  const { firebaseUser, aiThreads, createAiThread, saveAiMessage, fetchThreadMessages } = useFirebase();
  const { isDark } = useTheme();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CopilotTab>('chat');
  const [toolMode, setToolMode] = useState<GroundingTool>('chat');
  const [depth, setDepth] = useState<ReasoningDepth>('general');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);

  const getWelcomeText = (l: Language) =>
    persona === 'partner'
      ? tr(
          l,
          'Assalam-o-Alaikum Pro Partner! Ask me about busy routes, Google Maps hotspots, today’s live Pakistan fuel rates via Google Search, or speak directly using the mic.',
          'السلام علیکم پرو پارٹنر! مجھ سے مصروف روٹس، گوگل میپس ہاٹ اسپاٹس، آج کے پیٹرول ریٹس پوچھیں یا مائیک سے براہِ راست بات کریں۔'
        )
      : tr(
          l,
          'Assalam-o-Alaikum! I am your PRO RIDER AI Concierge. Ask me about rides, compare fares, discover nearby landmarks via Google Maps, check live traffic/fuel prices via Google Search, or switch to Live Voice.',
          'السلام علیکم! میں آپ کا پرو رائیڈر اے آئی اسسٹنٹ ہوں۔ سفر، کرایوں، گوگل میپس لوکیشنز اور پیٹرول ریٹس کے بارے میں پوچھیں یا لائیو وائس کال شروع کریں۔'
        );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: getWelcomeText(lang),
      mode: 'general',
    },
  ]);

  useEffect(() => {
    setMessages((prev) =>
      prev.map((m) => (m.id === 'welcome-msg' ? { ...m, text: getWelcomeText(lang) } : m))
    );
  }, [lang, persona]);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Live Voice API State
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceCaptions, setVoiceCaptions] = useState<Array<{ id: string; speaker: 'You' | 'PRO RIDER AI'; text: string }>>([]);
  const liveWsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, activeTab]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('open-prorider-ai-copilot', onOpen);
    return () => window.removeEventListener('open-prorider-ai-copilot', onOpen);
  }, []);

  const stopPlaybackQueue = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    activeSourcesRef.current = [];
    if (playCtxRef.current) {
      nextStartTimeRef.current = playCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const enqueuePcm24kAudio = (base64Pcm: string) => {
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextStartTimeRef.current = playCtxRef.current.currentTime;
    }
    const ctx = playCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const bytes = base64ToUint8Array(base64Pcm);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const audioBuf = ctx.createBuffer(1, float32.length, 24000);
    audioBuf.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + audioBuf.duration;
    activeSourcesRef.current.push(src);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
  };

  const stopLiveVoice = () => {
    stopPlaybackQueue();
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
      void micCtxRef.current.close();
    }
    micCtxRef.current = null;
    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {
        // ignore
      }
      liveWsRef.current = null;
    }
    setVoiceState('idle');
  };

  useEffect(() => {
    return () => {
      stopLiveVoice();
      if (playCtxRef.current && playCtxRef.current.state !== 'closed') {
        void playCtxRef.current.close();
      }
    };
  }, []);

  const startLiveVoice = async () => {
    if (voiceState === 'live' || voiceState === 'connecting') {
      stopLiveVoice();
      return;
    }
    setVoiceError(null);
    setVoiceState('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is unavailable in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
        playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      nextStartTimeRef.current = playCtxRef.current.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/live?persona=${persona}&lang=${lang}`);
      liveWsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            setVoiceState('live');
          } else if (msg.type === 'audio' && msg.data) {
            enqueuePcm24kAudio(msg.data);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setVoiceCaptions((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'You') {
                return [...prev.slice(0, -1), { ...last, text: `${last.text}${msg.text}` }];
              }
              return [...prev.slice(-14), { id: `u_${Date.now()}`, speaker: 'You', text: msg.text! }];
            });
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setVoiceCaptions((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'PRO RIDER AI') {
                return [...prev.slice(0, -1), { ...last, text: `${last.text}${msg.text}` }];
              }
              return [...prev.slice(-14), { id: `a_${Date.now()}`, speaker: 'PRO RIDER AI', text: msg.text! }];
            });
          } else if (msg.type === 'error') {
            setVoiceError(msg.message || 'Voice stream interrupted.');
            setVoiceState('error');
          } else if (msg.type === 'closed') {
            stopLiveVoice();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setVoiceError('WebSocket connection to Live Voice failed.');
        stopLiveVoice();
      };

      ws.onclose = () => {
        setVoiceState((prev) => (prev === 'error' ? 'error' : 'idle'));
      };

      const micCtx = new AudioContext();
      micCtxRef.current = micCtx;
      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const channelData = ev.inputBuffer.getChannelData(0);
        const pcm16 = downsampleTo16kInt16(channelData, micCtx.sampleRate);
        ws.send(JSON.stringify({ type: 'audio', data: arrayBufferToBase64(pcm16.buffer as ArrayBuffer) }));
      };

      source.connect(processor);
      processor.connect(micCtx.destination);
    } catch (err: any) {
      setVoiceError(err?.message || 'Could not start microphone stream.');
      stopLiveVoice();
    }
  };

  const handleLoadThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    setShowThreads(false);
    try {
      const cloudMsgs = await fetchThreadMessages(threadId);
      if (cloudMsgs.length > 0) {
        setMessages(
          cloudMsgs.map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            mode: m.mode,
            places: m.places,
            sources: m.sources,
          }))
        );
      }
    } catch (err: any) {
      setChatError(err?.message || 'Unable to load cloud conversation');
    }
  };

  const handleSendChat = async (
    e?: React.FormEvent,
    overridePrompt?: string,
    overrideTool?: GroundingTool
  ) => {
    e?.preventDefault();
    const prompt = (overridePrompt ?? input).trim();
    if (!prompt || sending) return;

    const effectiveTool = overrideTool ?? toolMode;
    setChatError(null);
    if (!overridePrompt) setInput('');

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: prompt,
      mode: effectiveTool === 'chat' ? depth : effectiveTool,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setSending(true);

    try {
      let threadId = activeThreadId;
      if (firebaseUser?.emailVerified && !threadId) {
        threadId = await createAiThread(persona, depth, prompt);
        if (threadId) setActiveThreadId(threadId);
      }
      if (threadId) {
        void saveAiMessage(threadId, {
          sender: 'user',
          text: prompt,
          mode: userMsg.mode,
        }).catch(() => {});
      }

      let replyText = '';
      let replyPlaces: GroundedPlace[] | undefined;
      let replySources: GroundedSource[] | undefined;
      const replyMode: ChatMessage['mode'] = effectiveTool === 'chat' ? depth : effectiveTool;

      if (effectiveTool === 'maps') {
        const res = await apiRequest<{ text: string; places: GroundedPlace[] }>('/api/ai/maps-grounding', {
          method: 'POST',
          body: {
            query: prompt,
            lat: currentCoords?.lat,
            lng: currentCoords?.lng,
            lang,
          },
        });
        replyText = res.text || 'Here are verified Google Maps locations matching your query:';
        replyPlaces = res.places;
      } else if (effectiveTool === 'search') {
        const res = await apiRequest<{ text: string; sources: GroundedSource[] }>('/api/ai/search-grounding', {
          method: 'POST',
          body: { query: prompt, lang },
        });
        replyText = res.text || 'Here is what Google Search found:';
        replySources = res.sources;
      } else {
        const res = await apiRequest<{ text: string }>('/api/ai/chat', {
          method: 'POST',
          body: {
            message: prompt,
            depth,
            persona,
            lang,
            history: nextHistory
              .filter((m) => m.id !== 'welcome-msg')
              .slice(-10)
              .map((m) => ({
                role: m.sender === 'user' ? 'user' : 'model',
                text: m.text,
              })),
          },
        });
        replyText = res.text;
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        mode: replyMode,
        places: replyPlaces,
        sources: replySources,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (threadId) {
        void saveAiMessage(threadId, {
          sender: 'assistant',
          text: replyText,
          mode: replyMode,
          places: replyPlaces,
          sources: replySources,
        }).catch(() => {});
      }
    } catch (err: any) {
      setChatError(err?.message || tr(lang, 'AI service temporarily unavailable.', 'اے آئی سروس عارضی طور پر دستیاب نہیں ہے، براہِ کرم دوبارہ کوشش کریں۔'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Sculpted Executive AI Concierge & Voice Launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr(lang, 'Open PRO RIDER AI Copilot', 'پرو رائیڈر اے آئی کھولیں')}
        className={`pr-preserve-light group ${
          showFloatingOnMobile ? 'inline-flex' : 'hidden md:inline-flex'
        } fixed bottom-5 sm:bottom-6 ${
          lang === 'ur' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
        } z-40 items-center gap-3 pl-2 pr-4 py-2 rounded-2xl bg-gradient-to-br from-[#191A20] via-[#0D0D10] to-[#241C08] text-white border border-[#D4A017]/80 ring-1 ring-[#F4C430]/20 shadow-[0_12px_32px_-6px_rgba(212,160,23,0.4),0_8px_20px_-4px_rgba(0,0,0,0.45)] hover:border-[#F4C430] hover:-translate-y-0.5 transition-all duration-200 active:scale-95`}
      >
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F4C430] via-[#D4A017] to-[#9E730B] text-[#0D0D10] flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <Sparkles className="w-4 h-4" />
        </span>
        <span className="flex flex-col text-start leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F4C430]">
            PRO RIDER AI
          </span>
          <span className="text-xs font-bold text-white">
            {tr(lang, 'Smart Help & Voice', 'اے آئی اسسٹنٹ اور وائس')}
          </span>
        </span>
        <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#F4C430]">
          <Mic className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* Slide-over Copilot Panel */}
      {open && (
        <div
          dir={lang === 'ur' ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
        >
          <div
            className={`pr-preserve-light w-full max-w-md h-full flex flex-col shadow-2xl border-l ${
              isDark
                ? 'bg-[#0F1015] border-[#D4A017]/35 text-white'
                : 'bg-white border-zinc-200 text-[#0D0D10]'
            }`}
          >
            {/* Header */}
            <div className="bg-[#0D0D10] text-white px-5 py-4 flex items-center justify-between border-b border-[#D4A017]/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold leading-tight text-white">
                    {tr(lang, 'PRO RIDER AI Copilot', 'پرو رائیڈر اے آئی کوپائلٹ')}
                  </h2>
                  <p className="text-[11px] text-[#F4C430] font-mono">
                    {persona === 'partner'
                      ? tr(lang, 'Pro Partner Assistant', 'پرو پارٹنر اسسٹنٹ')
                      : tr(lang, 'Maps · Search · Live Voice', 'میپس · سرچ · لائیو وائس')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {firebaseUser && aiThreads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowThreads((v) => !v)}
                    title={tr(lang, 'Cloud Chat History', 'محفوظ چیٹ ہسٹری')}
                    className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-200"
                  >
                    <History className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    stopLiveVoice();
                    setOpen(false);
                  }}
                  aria-label={tr(lang, 'Close Copilot', 'اسسٹنٹ بند کریں')}
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Primary Mode Tabs */}
            <div
              className={`px-4 py-2.5 border-b flex items-center gap-2 shrink-0 ${
                isDark ? 'bg-[#14161E] border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`pr-no-recolor flex-1 py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors border ${
                  activeTab === 'chat'
                    ? isDark
                      ? 'bg-[#D4A017] text-[#0D0D10] border-[#F4C430]'
                      : 'bg-[#0D0D10] text-white border-[#0D0D10]'
                    : isDark
                    ? 'bg-[#1B1D26] text-zinc-200 border-zinc-700 hover:border-zinc-500'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {tr(lang, 'AI Chat & Grounding', 'اے آئی چیٹ اور میپس')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className={`pr-no-recolor flex-1 py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors border ${
                  activeTab === 'voice'
                    ? 'bg-[#D4A017] text-[#0D0D10] border-[#F4C430]'
                    : isDark
                    ? 'bg-[#1B1D26] text-zinc-200 border-zinc-700 hover:border-zinc-500'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                {tr(lang, 'Live Voice Call', 'لائیو وائس کال')}
              </button>
            </div>

            {showThreads && firebaseUser && (
              <div
                className={`px-4 py-3 border-b max-h-48 overflow-y-auto space-y-1.5 ${
                  isDark
                    ? 'bg-[#1B180E] border-[#D4A017]/35 text-amber-200'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>{tr(lang, 'Saved Cloud Conversations', 'محفوظ کلاؤڈ گفتگو')} ({firebaseUser.email})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThreadId(null);
                      setShowThreads(false);
                    }}
                    className="underline font-extrabold"
                  >
                    {tr(lang, 'New Chat', 'نئی چیٹ')}
                  </button>
                </div>
                {aiThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleLoadThread(t.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs ${
                      isDark
                        ? 'bg-[#131419] border-zinc-700 hover:border-[#D4A017] text-white'
                        : 'bg-white border-amber-200 hover:border-[#D4A017] text-[#0D0D10]'
                    }`}
                  >
                    <p className="font-bold truncate">{t.title}</p>
                    {t.lastMessagePreview && (
                      <p className={`text-[11px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {t.lastMessagePreview}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'chat' ? (
              <>
                {/* Grounding & Depth Selectors */}
                <div
                  className={`px-4 py-2.5 border-b space-y-2 shrink-0 ${
                    isDark ? 'bg-[#111218] border-zinc-800' : 'bg-white border-zinc-100'
                  }`}
                >
                  <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setToolMode('chat');
                        setChatError(null);
                      }}
                      className={`pr-no-recolor py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border transition-colors ${
                        toolMode === 'chat'
                          ? isDark
                            ? 'bg-[#D4A017] text-[#0D0D10] border-[#F4C430]'
                            : 'bg-[#0D0D10] text-white border-[#0D0D10]'
                          : isDark
                          ? 'bg-[#1B1D26] text-zinc-200 border-zinc-700 hover:border-zinc-500'
                          : 'bg-white text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <Bot className="w-3 h-3" />
                      {tr(lang, 'AI Concierge', 'اے آئی مدد')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToolMode('maps');
                        setChatError(null);
                      }}
                      className={`pr-no-recolor py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border transition-colors ${
                        toolMode === 'maps'
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : isDark
                          ? 'bg-[#1B1D26] text-zinc-200 border-zinc-700 hover:border-emerald-500'
                          : 'bg-white text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <Compass className="w-3 h-3" />
                      {tr(lang, 'Maps Data', 'میپس ڈیٹا')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToolMode('search');
                        setChatError(null);
                      }}
                      className={`pr-no-recolor py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border transition-colors ${
                        toolMode === 'search'
                          ? 'bg-blue-600 text-white border-blue-500'
                          : isDark
                          ? 'bg-[#1B1D26] text-zinc-200 border-zinc-700 hover:border-blue-500'
                          : 'bg-white text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      {tr(lang, 'Web Search', 'ویب سرچ')}
                    </button>
                  </div>

                  {toolMode === 'chat' && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {tr(lang, 'Reasoning Mode:', 'جوابی انداز:')}
                      </span>
                      <div
                        className={`inline-flex rounded-lg p-0.5 gap-0.5 border ${
                          isDark ? 'bg-[#1A1C24] border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                        }`}
                      >
                        {(['fast', 'general', 'deep'] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDepth(d)}
                            className={`pr-no-recolor px-2.5 py-1 rounded-md capitalize font-bold transition-colors ${
                              depth === d
                                ? isDark
                                  ? 'bg-[#D4A017] text-[#0D0D10]'
                                  : 'bg-white text-[#0D0D10] shadow-xs'
                                : isDark
                                ? 'text-zinc-300 hover:text-white'
                                : 'text-zinc-600 hover:text-[#0D0D10]'
                            }`}
                          >
                            {d === 'fast'
                              ? tr(lang, 'Fast', 'تیز')
                              : d === 'general'
                              ? tr(lang, 'Balanced', 'متوازن')
                              : tr(lang, 'Deep', 'گہرا')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable Messages */}
                <div
                  ref={scrollRef}
                  className={`flex-1 overflow-y-auto p-4 space-y-3 ${
                    isDark ? 'bg-[#09090C]' : 'bg-[#F8F8FA]'
                  }`}
                >
                  {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        dir="auto"
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          m.sender === 'user'
                            ? isDark
                              ? 'bg-[#D4A017] text-[#0D0D10] font-semibold shadow-sm'
                              : 'bg-[#0D0D10] text-white font-medium'
                            : isDark
                            ? 'bg-[#161822] border border-[#D4A017]/30 text-zinc-100 shadow-xs'
                            : 'bg-white border border-zinc-200 text-[#0D0D10] shadow-xs'
                        }`}
                      >
                        {m.text}
                      </div>

                      {/* Google Maps Grounding Cards */}
                      {m.places && m.places.length > 0 && (
                        <div className="mt-2 w-[88%] space-y-1.5">
                          <p
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isDark ? 'text-emerald-400' : 'text-emerald-800'
                            }`}
                          >
                            {tr(lang, 'Google Maps Verified Places', 'گوگل میپس تصدیق شدہ مقامات')}
                          </p>
                          {m.places.map((pl, idx) => (
                            <a
                              key={`${m.id}-pl-${idx}`}
                              href={pl.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block rounded-xl border p-2.5 text-xs transition-colors ${
                                isDark
                                  ? 'bg-[#121B17] border-emerald-700/60 hover:border-emerald-400 text-white'
                                  : 'bg-white border-emerald-200 hover:border-emerald-500 text-[#0D0D10]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 font-bold">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                                  {pl.title}
                                </span>
                                <ExternalLink className={`w-3 h-3 shrink-0 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
                              </div>
                              {pl.reviewSnippets && pl.reviewSnippets.length > 0 && (
                                <p className={`mt-1 text-[11px] line-clamp-2 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                  “{pl.reviewSnippets[0]}”
                                </p>
                              )}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Google Search Grounding Citations */}
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-2 w-[88%] space-y-1">
                          <p
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isDark ? 'text-sky-400' : 'text-blue-800'
                            }`}
                          >
                            {tr(lang, 'Google Search Sources', 'گوگل سرچ ذرائع')}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.sources.map((src, idx) => (
                              <a
                                key={`${m.id}-src-${idx}`}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium max-w-full transition-colors ${
                                  isDark
                                    ? 'bg-[#131A26] border-blue-700/60 hover:border-sky-400 text-sky-300'
                                    : 'bg-white border-blue-200 hover:border-blue-500 text-blue-900'
                                }`}
                              >
                                <span className="truncate max-w-[190px]">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {sending && (
                    <div className={`flex items-center gap-2 text-xs font-medium px-2 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4A017]" />
                      {tr(lang, 'Thinking...', 'جواب تیار کیا جا رہا ہے...')}
                    </div>
                  )}
                </div>

                {/* Quick Touch Question Prompts (Crisp in Both Light & Dark Mode) */}
                <div
                  className={`px-3.5 py-2.5 border-t flex gap-1.5 overflow-x-auto shrink-0 ${
                    isDark ? 'bg-[#12141B] border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setToolMode('chat');
                      void handleSendChat(
                        undefined,
                        tr(
                          lang,
                          'Compare Pick & Drop, Ride Sharing, and Fuel Sharing savings in Pakistan.',
                          'پِک اینڈ ڈراپ، رائیڈ شیئرنگ اور فیول شیئرنگ میں کرایہ اور بچت کا موازنہ بتائیں۔'
                        ),
                        'chat'
                      );
                    }}
                    className={`pr-no-recolor px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border disabled:opacity-50 transition-colors ${
                      isDark
                        ? 'bg-[#1D180C] text-[#F4C430] border-[#D4A017]/60 hover:bg-[#D4A017]/20'
                        : 'bg-[#0D0D10] text-[#F4C430] border-[#0D0D10] hover:bg-zinc-900'
                    }`}
                  >
                    {tr(lang, 'Compare Services', 'سروسز کا موازنہ')}
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setToolMode('chat');
                      void handleSendChat(
                        undefined,
                        persona === 'partner'
                          ? tr(
                              lang,
                              'How do I complete Pro Partner driver documents, privacy settings, and accept rides?',
                              'پرو پارٹنر ڈرائیور اپنے ڈاکومنٹس، پرائیویسی سیٹنگ اور نئی رائیڈ قبول کرنے کا طریقہ بتائیں؟'
                            )
                          : tr(
                              lang,
                              'How do I book a Pick & Drop ride or Monthly Package on PRO RIDER AI?',
                              'پرو رائیڈر اے آئی پر پِک اینڈ ڈراپ رائیڈ یا ماہانہ پیکج کیسے بک کریں؟'
                            ),
                        'chat'
                      );
                    }}
                    className={`pr-no-recolor px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border disabled:opacity-50 transition-colors ${
                      isDark
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70 hover:bg-emerald-900/70'
                        : 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    {persona === 'partner'
                      ? tr(lang, 'Driver Docs & Rides', 'ڈرائیور ڈاکومنٹس اور رائیڈ')
                      : tr(lang, 'How to Book Ride', 'رائیڈ بکنگ کا طریقہ')}
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setToolMode('chat');
                      void handleSendChat(
                        undefined,
                        tr(
                          lang,
                          'What are the vehicle options, fares, and official support contact details?',
                          'کون کون سی گاڑیاں دستیاب ہیں، کرایہ کیسے طے ہوتا ہے اور آفیشل سپورٹ نمبر کیا ہے؟'
                        ),
                        'chat'
                      );
                    }}
                    className={`pr-no-recolor px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border disabled:opacity-50 transition-colors ${
                      isDark
                        ? 'bg-amber-950/80 text-amber-200 border-amber-700/70 hover:bg-amber-900/70'
                        : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {tr(lang, 'Vehicles & Support', 'گاڑیاں اور سپورٹ')}
                  </button>
                </div>

                {chatError && (
                  <div
                    className={`px-4 py-2 text-[11px] font-semibold border-t flex items-center justify-between gap-2 ${
                      isDark
                        ? 'bg-red-950/80 text-red-200 border-red-800'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    <span className="min-w-0">{chatError}</span>
                    {toolMode !== 'chat' && (
                      <button
                        type="button"
                        onClick={() => {
                          setToolMode('chat');
                          setChatError(null);
                        }}
                        className="pr-no-recolor px-2 py-1 rounded bg-[#0D0D10] text-[#F4C430] border border-[#D4A017]/60 text-[10px] font-bold whitespace-nowrap shrink-0"
                      >
                        {tr(lang, 'Use AI Chat', 'اے آئی چیٹ استعمال کریں')}
                      </button>
                    )}
                  </div>
                )}

                {/* Chat Composer + Audio Transcribe Mic */}
                <form
                  onSubmit={(e) => handleSendChat(e)}
                  className={`p-3 border-t flex items-center gap-2 shrink-0 ${
                    isDark ? 'bg-[#12141B] border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <VoiceTranscribeButton
                    lang={lang}
                    disabled={sending}
                    title={tr(lang, 'Speak message (Audio Transcribe)', 'بول کر پیغام لکھیں')}
                    onTranscript={(text) => {
                      setChatError(null);
                      setInput((prev) => (prev ? `${prev} ${text}` : text));
                    }}
                    onError={(msg) => setChatError(msg)}
                  />
                  <input
                    dir="auto"
                    value={input}
                    onChange={(e) => {
                      if (chatError) setChatError(null);
                      setInput(e.target.value);
                    }}
                    placeholder={
                      toolMode === 'maps'
                        ? tr(lang, 'Search places with Google Maps...', 'گوگل میپس پر مقام تلاش کریں...')
                        : toolMode === 'search'
                        ? tr(lang, 'Ask live traffic/fuel via Google Search...', 'گوگل سرچ سے ٹریفک یا پیٹرول ریٹ پوچھیں...')
                        : tr(lang, 'Ask PRO RIDER AI anything...', 'پرو رائیڈر اے آئی سے کچھ بھی پوچھیں...')
                    }
                    className={`flex-1 px-3 py-2 rounded-xl border text-xs font-medium focus:outline-none focus:border-[#D4A017] ${
                      isDark
                        ? 'bg-[#1B1D26] border-zinc-700 text-white placeholder:text-zinc-400'
                        : 'bg-white border-zinc-300 text-[#0D0D10] placeholder:text-zinc-500'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    aria-label={tr(lang, 'Send message', 'پیغام بھیجیں')}
                    className="pr-no-recolor p-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308] disabled:opacity-40 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              /* LIVE VOICE CONVERSATION TAB (Gemini Live API) */
              <div
                className={`flex-1 flex flex-col justify-between p-5 transition-colors ${
                  isDark ? 'bg-[#09090C] text-white' : 'bg-[#F8F8FA] text-[#0D0D10]'
                }`}
              >
                <div className="space-y-4">
                  <div
                    className={`rounded-2xl border p-6 text-center space-y-3 ${
                      isDark ? 'bg-[#16171C] border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
                    }`}
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center transition-all ${
                        voiceState === 'live'
                          ? 'bg-[#D4A017] text-[#0D0D10] shadow-lg shadow-[#D4A017]/30 animate-pulse'
                          : voiceState === 'connecting'
                          ? isDark
                            ? 'bg-amber-900/60 text-[#D4A017]'
                            : 'bg-amber-100 text-[#9A6E08]'
                          : isDark
                          ? 'bg-zinc-900 text-zinc-300 border border-zinc-700'
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                      }`}
                    >
                      <Volume2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className={`font-display text-lg font-bold ${isDark ? 'text-white' : 'text-[#0D0D10]'}`}>
                        {voiceState === 'live'
                          ? tr(lang, 'Live Voice Connected', 'لائیو وائس کال منسلک ہے')
                          : voiceState === 'connecting'
                          ? tr(lang, 'Connecting Live Voice...', 'لائیو وائس کنیکٹ ہو رہی ہے...')
                          : tr(lang, 'Hands-Free Travel Voice Assistant', 'ہینڈز فری وائس ٹریول اسسٹنٹ')}
                      </h3>
                      <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {tr(
                          lang,
                          'Speak naturally in English or Urdu. Interrupt anytime — audio streams in real time.',
                          'انگریزی یا اردو میں قدرتی انداز میں بات کریں۔ کسی بھی وقت روک کر اگلا سوال پوچھ سکتے ہیں۔'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startLiveVoice}
                      className={`pr-no-recolor w-full py-3 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors ${
                        voiceState === 'live' || voiceState === 'connecting'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : isDark
                          ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                          : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                      }`}
                    >
                      {voiceState === 'live' || voiceState === 'connecting' ? (
                        <>
                          <PhoneOff className="w-4 h-4" /> {tr(lang, 'End Voice Conversation', 'وائس کال بند کریں')}
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" /> {tr(lang, 'Start Live Voice Conversation', 'لائیو وائس کال شروع کریں')}
                        </>
                      )}
                    </button>
                  </div>

                  {voiceError && (
                    <div
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                        isDark
                          ? 'bg-red-950/70 border-red-800 text-red-200'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {voiceError}
                    </div>
                  )}

                  <div
                    className={`rounded-2xl border p-4 h-64 overflow-y-auto space-y-2.5 ${
                      isDark ? 'bg-[#16171C] border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
                    }`}
                  >
                    <p
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {tr(lang, 'Live Speech Captions', 'لائیو گفتگو کی تحریر')}
                    </p>
                    {voiceCaptions.length === 0 ? (
                      <p className={`text-xs italic ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {tr(
                          lang,
                          'Tap Start Live Voice Conversation and speak into your microphone.',
                          'لائیو وائس کال شروع کریں پر کلک کر کے مائیکروفون میں بولیں۔'
                        )}
                      </p>
                    ) : (
                      voiceCaptions.map((cap) => (
                        <div key={cap.id} className="text-xs leading-relaxed">
                          <span
                            className={
                              cap.speaker === 'You'
                                ? isDark
                                  ? 'text-zinc-400 font-bold'
                                  : 'text-zinc-600 font-bold'
                                : 'text-[#D4A017] font-bold'
                            }
                          >
                            {cap.speaker === 'You' ? tr(lang, 'You', 'آپ') : tr(lang, 'PRO RIDER AI', 'پرو رائیڈر اے آئی')}:{' '}
                          </span>
                          <span className={isDark ? 'text-zinc-100' : 'text-[#0D0D10]'}>{cap.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {voiceState === 'live' && (
                  <button
                    type="button"
                    onClick={() => {
                      liveWsRef.current?.send(
                        JSON.stringify({
                          type: 'text',
                          text:
                            persona === 'partner'
                              ? 'Give me a quick 2-sentence tip to maximize ride requests in Islamabad today.'
                              : 'Briefly explain how Pick & Drop, Ride Sharing, and Fuel Sharing save money in Pakistan.',
                        })
                      );
                    }}
                    className={`pr-no-recolor w-full py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      isDark
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
                        : 'bg-white border-zinc-300 text-[#0D0D10] hover:bg-zinc-100'
                    }`}
                  >
                    {tr(lang, 'Ask Quick Spoken Tip', 'فوری صوتی مشورہ سنیں')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

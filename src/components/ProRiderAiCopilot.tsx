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
}) => {
  const { firebaseUser, aiThreads, createAiThread, saveAiMessage, fetchThreadMessages } = useFirebase();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CopilotTab>('chat');
  const [toolMode, setToolMode] = useState<GroundingTool>('chat');
  const [depth, setDepth] = useState<ReasoningDepth>('general');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text:
        persona === 'partner'
          ? 'Assalam-o-Alaikum Pro Partner! Ask me about busy routes, Google Maps hotspots, today’s live Pakistan fuel rates via Google Search, or speak directly using the mic.'
          : 'Assalam-o-Alaikum! I am your PRO RIDER AI Concierge. Ask me about rides, compare fares, discover nearby landmarks via Google Maps, check live traffic/fuel prices via Google Search, or switch to Live Voice.',
      mode: 'general',
    },
  ]);
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

  const handleSendChat = async (e?: React.FormEvent, overridePrompt?: string) => {
    e?.preventDefault();
    const prompt = (overridePrompt ?? input).trim();
    if (!prompt || sending) return;

    setChatError(null);
    if (!overridePrompt) setInput('');

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: prompt,
      mode: toolMode === 'chat' ? depth : toolMode,
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
      const replyMode: ChatMessage['mode'] = toolMode === 'chat' ? depth : toolMode;

      if (toolMode === 'maps') {
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
      } else if (toolMode === 'search') {
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
      setChatError(err?.message || 'AI service temporarily unavailable.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating Launcher Button (Desktop; mobile triggers from header to avoid covering action buttons) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open PRO RIDER AI Copilot"
        className="hidden md:inline-flex fixed bottom-6 right-6 z-40 items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#0D0D10] text-white border border-[#D4A017]/70 shadow-xl hover:bg-zinc-900 transition-transform active:scale-95"
      >
        <Sparkles className="w-4 h-4 text-[#D4A017]" />
        <span className="text-xs font-bold tracking-wide">AI Concierge &amp; Voice</span>
      </button>

      {/* Slide-over Copilot Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-zinc-200">
            {/* Header */}
            <div className="bg-[#0D0D10] text-white px-5 py-4 flex items-center justify-between border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-bold leading-tight">PRO RIDER AI Copilot</h2>
                  <p className="text-[11px] text-[#D4A017] font-mono">
                    {persona === 'partner' ? 'Pro Partner Assistant' : 'Maps · Search · Live Voice'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {firebaseUser && aiThreads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowThreads((v) => !v)}
                    title="Cloud Chat History"
                    className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300"
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
                  aria-label="Close Copilot"
                  className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Primary Mode Tabs */}
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'chat' ? 'bg-[#0D0D10] text-white' : 'bg-white text-zinc-600 border border-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                AI Chat &amp; Grounding
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'voice'
                    ? 'bg-[#D4A017] text-[#0D0D10]'
                    : 'bg-white text-zinc-600 border border-zinc-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Live Voice Call
              </button>
            </div>

            {showThreads && firebaseUser && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 max-h-48 overflow-y-auto space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                  <span>Saved Cloud Conversations ({firebaseUser.email})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThreadId(null);
                      setShowThreads(false);
                    }}
                    className="underline"
                  >
                    New Chat
                  </button>
                </div>
                {aiThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleLoadThread(t.id)}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-white border border-amber-200 hover:border-[#D4A017] text-xs"
                  >
                    <p className="font-semibold text-[#0D0D10] truncate">{t.title}</p>
                    {t.lastMessagePreview && (
                      <p className="text-[11px] text-zinc-500 truncate">{t.lastMessagePreview}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'chat' ? (
              <>
                {/* Grounding & Depth Selectors */}
                <div className="px-4 py-2.5 border-b border-zinc-100 space-y-2 shrink-0">
                  <div className="grid grid-cols-3 gap-1.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setToolMode('chat')}
                      className={`py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border ${
                        toolMode === 'chat'
                          ? 'bg-[#0D0D10] text-white border-[#0D0D10]'
                          : 'bg-white text-zinc-600 border-zinc-200'
                      }`}
                    >
                      <Bot className="w-3 h-3" />
                      AI Concierge
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('maps')}
                      className={`py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border ${
                        toolMode === 'maps'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-zinc-600 border-zinc-200'
                      }`}
                    >
                      <Compass className="w-3 h-3" />
                      Maps Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('search')}
                      className={`py-1.5 rounded-lg inline-flex items-center justify-center gap-1 border ${
                        toolMode === 'search'
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-zinc-600 border-zinc-200'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      Web Search
                    </button>
                  </div>

                  {toolMode === 'chat' && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 font-medium">Reasoning Mode:</span>
                      <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 gap-0.5">
                        {(['fast', 'general', 'deep'] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDepth(d)}
                            className={`px-2.5 py-1 rounded-md capitalize font-semibold ${
                              depth === d ? 'bg-white text-[#0D0D10] shadow-xs' : 'text-zinc-500'
                            }`}
                          >
                            {d === 'fast' ? 'Fast' : d === 'general' ? 'Balanced' : 'Deep'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F8FA]">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          m.sender === 'user'
                            ? 'bg-[#0D0D10] text-white'
                            : 'bg-white border border-zinc-200 text-[#0D0D10] shadow-xs'
                        }`}
                      >
                        {m.text}
                      </div>

                      {/* Google Maps Grounding Cards */}
                      {m.places && m.places.length > 0 && (
                        <div className="mt-2 w-[88%] space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            Google Maps Verified Places
                          </p>
                          {m.places.map((pl, idx) => (
                            <a
                              key={`${m.id}-pl-${idx}`}
                              href={pl.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-xl bg-white border border-emerald-200 hover:border-emerald-500 p-2.5 text-xs transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 font-bold text-[#0D0D10]">
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  {pl.title}
                                </span>
                                <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                              </div>
                              {pl.reviewSnippets && pl.reviewSnippets.length > 0 && (
                                <p className="mt-1 text-[11px] text-zinc-600 line-clamp-2">
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
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                            Google Search Sources
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.sources.map((src, idx) => (
                              <a
                                key={`${m.id}-src-${idx}`}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-200 hover:border-blue-500 text-[11px] font-medium text-blue-900 max-w-full"
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
                    <div className="flex items-center gap-2 text-xs text-zinc-500 px-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4A017]" />
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Quick Suggestions */}
                <div className="px-4 py-2 bg-white border-t border-zinc-100 flex gap-1.5 overflow-x-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setToolMode('maps');
                      void handleSendChat(undefined, 'Find best fuel stations & cafes near Blue Area Islamabad');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 text-[11px] font-semibold whitespace-nowrap border border-emerald-200"
                  >
                    Nearby Fuel &amp; Landmarks
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setToolMode('search');
                      void handleSendChat(undefined, 'Current petrol price in Pakistan today PKR per liter');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 text-[11px] font-semibold whitespace-nowrap border border-blue-200"
                  >
                    Live Fuel Price PK
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setToolMode('chat');
                      void handleSendChat(undefined, 'Compare Pick & Drop vs Ride Sharing vs Fuel Sharing savings');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 text-[#0D0D10] text-[11px] font-semibold whitespace-nowrap border border-zinc-200"
                  >
                    Compare Services
                  </button>
                </div>

                {chatError && (
                  <div className="px-4 py-1.5 bg-red-50 text-red-700 text-[11px] font-medium border-t border-red-200">
                    {chatError}
                  </div>
                )}

                {/* Chat Composer + Audio Transcribe Mic */}
                <form onSubmit={(e) => handleSendChat(e)} className="p-3 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0">
                  <VoiceTranscribeButton
                    lang={lang}
                    disabled={sending}
                    title="Speak message (Audio Transcribe)"
                    onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
                    onError={(msg) => setChatError(msg)}
                  />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      toolMode === 'maps'
                        ? 'Search places with Google Maps...'
                        : toolMode === 'search'
                        ? 'Ask live traffic/fuel via Google Search...'
                        : 'Ask PRO RIDER AI anything...'
                    }
                    className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:border-[#D4A017]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    aria-label="Send message"
                    className="p-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308] disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              /* LIVE VOICE CONVERSATION TAB (Gemini Live API) */
              <div className="flex-1 flex flex-col justify-between p-5 bg-[#0D0D10] text-white">
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#16171C] border border-zinc-800 p-6 text-center space-y-3">
                    <div
                      className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center transition-all ${
                        voiceState === 'live'
                          ? 'bg-[#D4A017] text-[#0D0D10] shadow-lg shadow-[#D4A017]/30 animate-pulse'
                          : voiceState === 'connecting'
                          ? 'bg-amber-900/60 text-[#D4A017]'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      <Volume2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold">
                        {voiceState === 'live'
                          ? 'Live Voice Connected'
                          : voiceState === 'connecting'
                          ? 'Connecting Gemini Live Voice...'
                          : 'Hands-Free Travel Voice Assistant'}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1">
                        Speak naturally in English or Urdu. Interrupt anytime — audio streams in real time at 16kHz / 24kHz PCM.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startLiveVoice}
                      className={`w-full py-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                        voiceState === 'live' || voiceState === 'connecting'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                      }`}
                    >
                      {voiceState === 'live' || voiceState === 'connecting' ? (
                        <>
                          <PhoneOff className="w-4 h-4" /> End Voice Conversation
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" /> Start Live Voice Conversation
                        </>
                      )}
                    </button>
                  </div>

                  {voiceError && (
                    <div className="rounded-xl bg-red-950/70 border border-red-800 px-3.5 py-2 text-xs text-red-200">
                      {voiceError}
                    </div>
                  )}

                  <div className="rounded-2xl bg-[#16171C] border border-zinc-800 p-4 h-64 overflow-y-auto space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Live Speech Captions
                    </p>
                    {voiceCaptions.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">
                        Tap Start Live Voice Conversation and speak into your microphone.
                      </p>
                    ) : (
                      voiceCaptions.map((cap) => (
                        <div key={cap.id} className="text-xs leading-relaxed">
                          <span className={cap.speaker === 'You' ? 'text-zinc-400 font-bold' : 'text-[#D4A017] font-bold'}>
                            {cap.speaker}:{' '}
                          </span>
                          <span className="text-zinc-200">{cap.text}</span>
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
                    className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white"
                  >
                    Ask Quick Spoken Tip
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

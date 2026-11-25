import React, { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import type { Language } from '../types';
import { apiRequest } from '../utils/api';

interface VoiceTranscribeButtonProps {
  lang?: Language;
  disabled?: boolean;
  compact?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  title?: string;
}

export const VoiceTranscribeButton: React.FC<VoiceTranscribeButtonProps> = ({
  lang = 'en',
  disabled = false,
  compact = true,
  onTranscript,
  onError,
  title = 'Speak to transcribe audio',
}) => {
  const { isDark } = useTheme();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const handleToggle = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError?.('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: preferredMime });
        chunksRef.current = [];
        if (blob.size < 250) {
          return;
        }
        setTranscribing(true);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to encode audio'));
            reader.readAsDataURL(blob);
          });
          const res = await apiRequest<{ transcript: string }>('/api/ai/transcribe', {
            method: 'POST',
            body: {
              audioBase64: dataUrl,
              mimeType: preferredMime.split(';')[0],
              lang,
            },
          });
          if (res.transcript) {
            onTranscript(res.transcript);
          } else {
            onError?.('No speech detected. Try speaking closer to the mic.');
          }
        } catch (err: any) {
          onError?.(err?.message || 'Audio transcription failed');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      stopTracks();
      onError?.('Microphone permission denied. Allow mic access to transcribe speech.');
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || transcribing}
      onClick={handleToggle}
      title={recording ? 'Stop recording & transcribe' : title}
      aria-label={recording ? 'Stop voice recording' : 'Voice audio transcription'}
      className={`inline-flex items-center justify-center rounded-lg transition-colors shrink-0 ${
        compact ? 'p-2' : 'px-3 py-2 gap-1.5 text-xs font-semibold'
      } ${
        recording
          ? 'bg-red-600 text-white animate-pulse'
          : transcribing
          ? 'bg-amber-100 text-[#B8860B]'
          : isDark
          ? 'text-zinc-200 hover:text-[#F4C430] hover:bg-zinc-800 border border-zinc-700'
          : 'text-zinc-700 hover:text-[#0D0D10] hover:bg-zinc-100 border border-zinc-200'
      } disabled:opacity-40`}
    >
      {transcribing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : recording ? (
        <Square className="w-3.5 h-3.5 fill-current" />
      ) : (
        <Mic className="w-3.5 h-3.5" />
      )}
      {!compact && (
        <span>{transcribing ? 'Transcribing...' : recording ? 'Stop' : 'Voice Input'}</span>
      )}
    </button>
  );
};

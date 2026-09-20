'use client';

import { useCallback, useRef, useState } from 'react';

// The 60-second recorder (S-2): MediaRecorder for capture, a Web Audio
// AnalyserNode feeding the waveform canvas with the mic's real level rather
// than a synthetic one. `levels` is a rolling window of 0..1 amplitude
// samples for waveform-canvas.tsx to draw.
export const RECORDING_CAP_SECONDS = 60;

export type RecorderState = 'idle' | 'recording' | 'stopping';

export interface UseAudioRecorderResult {
  state: RecorderState;
  elapsedSeconds: number;
  levels: number[];
  error: string | null;
  start(): Promise<void>;
  stop(): void;
}

export function useAudioRecorder(
  onStopped: (result: { blob: Blob; contentType: string; durSeconds: number }) => void,
): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedSecondsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    rafRef.current = null;
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const sample of data) {
      const normalized = (sample - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    setLevels((prev) => [...prev.slice(-119), Math.min(1, rms * 4)]);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setState('stopping');
      mediaRecorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durSeconds = Math.min(RECORDING_CAP_SECONDS, elapsedSecondsRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        setState('idle');
        setElapsedSeconds(0);
        setLevels([]);
        onStopped({ blob, contentType: mimeType, durSeconds });
      };

      recorder.start();
      setState('recording');
      setLevels([]);
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;

      intervalRef.current = setInterval(() => {
        elapsedSecondsRef.current += 1;
        setElapsedSeconds(elapsedSecondsRef.current);
        if (elapsedSecondsRef.current >= RECORDING_CAP_SECONDS) stop();
      }, 1000);

      tick();
    } catch {
      setError("Couldn't reach the microphone. Check the browser's permission for this site.");
      cleanup();
      setState('idle');
    }
  }, [cleanup, onStopped, stop, tick]);

  return { state, elapsedSeconds, levels, error, start, stop };
}

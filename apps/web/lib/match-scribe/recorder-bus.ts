'use client';

import { useEffect, useState } from 'react';

// The shell's record controls (the mobile Scribe tab) and the recorder card
// on /match-scribe are in different trees. PRD-02 S-2 and section 4.6: while
// recording, a tap on the Scribe tab stops it, and the tab pulses. These two
// window events are the whole contract between them.
const TOGGLE = 'deucex:scribe-toggle';
const STATE = 'deucex:scribe-recording';

let recording = false;

export function requestScribeToggle(): void {
  window.dispatchEvent(new Event(TOGGLE));
}

export function onScribeToggle(handler: () => void): () => void {
  window.addEventListener(TOGGLE, handler);
  return () => window.removeEventListener(TOGGLE, handler);
}

export function announceScribeRecording(value: boolean): void {
  recording = value;
  window.dispatchEvent(new CustomEvent<boolean>(STATE, { detail: value }));
}

export function useScribeRecording(): boolean {
  const [value, setValue] = useState(recording);
  useEffect(() => {
    const handler = (event: Event) => setValue((event as CustomEvent<boolean>).detail);
    window.addEventListener(STATE, handler);
    return () => window.removeEventListener(STATE, handler);
  }, []);
  return value;
}

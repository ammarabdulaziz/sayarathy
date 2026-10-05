import { useEffect, useState } from 'react';
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  useEffect(() => {
    const available = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', available); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', done); };
  }, []);
  return { installed, available: !!prompt, install: async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice; setPrompt(null); } };
}

export function registerOnlineWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* Browser installation UI remains available where supported. */ }); });
  }
}

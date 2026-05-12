"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Square } from "lucide-react";
import type { PersonalityPreset } from "@/store/voicePlatformStore";

type Lang = "bn" | "en" | "auto";

const PREVIEW_BY_LANG: Record<Lang, string> = {
  en: "Hi, this is a short preview of how I might sound on a call. How can I help you today?",
  bn: "আসসালামু আলাইকুম। আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  auto: "Hello — this is a quick bilingual preview line for testing the agent voice.",
};

const RATE_BY_PRESET: Record<PersonalityPreset, number> = {
  professional: 0.94,
  friendly: 1.02,
  sales: 1.05,
  support: 0.96,
};

type Props = {
  language: Lang;
  personalityPreset: PersonalityPreset;
};

export function VoicePreviewButton({ language, personalityPreset }: Props) {
  const [busy, setBusy] = useState(false);

  const play = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const line = PREVIEW_BY_LANG[language === "auto" ? "auto" : language];
    const u = new SpeechSynthesisUtterance(line);
    u.lang = language === "bn" ? "bn-BD" : "en-US";
    u.rate = RATE_BY_PRESET[personalityPreset];
    u.onend = () => setBusy(false);
    u.onerror = () => setBusy(false);
    setBusy(true);
    synth.speak(u);
  }, [language, personalityPreset]);

  const stop = () => {
    window.speechSynthesis?.cancel();
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={play} disabled={busy}>
        <Volume2 className="h-4 w-4 mr-2" />
        {busy ? "Playing…" : "Test voice"}
      </Button>
      {busy ? (
        <Button type="button" variant="outline" size="sm" onClick={stop}>
          <Square className="h-3 w-3 mr-1" />
          Stop
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground max-w-md">
        Browser speech preview only. Production audio uses your media / TTS provider (e.g. Google,
        ElevenLabs).
      </p>
    </div>
  );
}

// hooks/useSpeech.ts
// Web Speech API — Free TTS for Barbaros Interview
// Supports: Arabic, English, Mixed

import { useCallback, useEffect, useRef, useState } from "react";

type Language = "ar" | "en" | "mix";

interface UseSpeechOptions {
  language: Language;
  onStart?: () => void;
  onEnd?: () => void;
}

interface UseSpeechReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

// Detect if text is primarily Arabic
const isArabicText = (text: string): boolean => {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  return totalChars > 0 && arabicChars / totalChars > 0.3;
};

// Get the best available voice for a language
const getBestVoice = (
  voices: SpeechSynthesisVoice[],
  lang: "ar" | "en"
): SpeechSynthesisVoice | null => {
  if (lang === "ar") {
    // Priority: ar-SA > ar-AE > ar-EG > any Arabic
    const priority = ["ar-SA", "ar-AE", "ar-EG", "ar-BH", "ar-KW"];
    for (const code of priority) {
      const v = voices.find((v) => v.lang === code);
      if (v) return v;
    }
    return voices.find((v) => v.lang.startsWith("ar")) || null;
  } else {
    // Priority: en-GB (more formal) > en-US > any English
    // Prefer voices with "male" or deep names
    const deepNames = ["daniel", "oliver", "arthur", "reed", "wayne"];
    const gbVoices = voices.filter((v) => v.lang === "en-GB");
    const deepGb = gbVoices.find((v) =>
      deepNames.some((n) => v.name.toLowerCase().includes(n))
    );
    if (deepGb) return deepGb;
    if (gbVoices.length > 0) return gbVoices[0];

    const usVoices = voices.filter((v) => v.lang === "en-US");
    const deepUs = usVoices.find((v) =>
      deepNames.some((n) => v.name.toLowerCase().includes(n))
    );
    if (deepUs) return deepUs;
    if (usVoices.length > 0) return usVoices[0];

    return voices.find((v) => v.lang.startsWith("en")) || null;
  }
};

export function useSpeech({
  language,
  onStart,
  onEnd,
}: UseSpeechOptions): UseSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load voices (browsers load them async)
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      // Stop any current speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // ─── Stern Authoritative Settings ───────────────────────
      utterance.pitch = 0.75;   // Low pitch = commanding, authoritative
      utterance.rate = 0.88;    // Slightly slow = deliberate, serious
      utterance.volume = 1.0;   // Full volume = confidence
      // ────────────────────────────────────────────────────────

      // Determine which language to use
      let targetLang: "ar" | "en";
      if (language === "ar") {
        targetLang = "ar";
      } else if (language === "en") {
        targetLang = "en";
      } else {
        // mix: auto-detect based on text content
        targetLang = isArabicText(text) ? "ar" : "en";
      }

      // Set lang attribute
      utterance.lang = targetLang === "ar" ? "ar-SA" : "en-GB";

      // Assign best voice if available
      if (voices.length > 0) {
        const bestVoice = getBestVoice(voices, targetLang);
        if (bestVoice) utterance.voice = bestVoice;
      }

      // Events
      utterance.onstart = () => {
        setIsSpeaking(true);
        onStart?.();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        onEnd?.();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        onEnd?.();
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, voices, language, onStart, onEnd]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  return { speak, stop, isSpeaking, isSupported };
}

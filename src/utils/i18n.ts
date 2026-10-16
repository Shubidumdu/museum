export type Language = "ko" | "en";

const STORAGE_KEY = "museum_lang";

const listeners = new Set<(lang: Language) => void>();

function detectBrowserLanguage(): Language {
  const browserLang =
    (typeof navigator !== "undefined" &&
      (navigator.language || (navigator.languages && navigator.languages[0]))) ||
    "";
  return browserLang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function getInitialLanguage(): Language {
  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const langParam = urlParams.get("lang")?.toLowerCase();
      if (langParam === "ko" || langParam === "en") {
        return langParam;
      }
    } catch {}
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en") {
      return saved;
    }
  } catch {}
  return detectBrowserLanguage();
}

let currentLanguage: Language = getInitialLanguage();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
  listeners.forEach((listener) => listener(lang));
}

export function toggleLanguage(): Language {
  const next = currentLanguage === "ko" ? "en" : "ko";
  setLanguage(next);
  return next;
}

export function onLanguageChange(
  listener: (lang: Language) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


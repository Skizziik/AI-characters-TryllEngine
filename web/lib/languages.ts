/** Conversation languages the user can pick. `name` is what gets injected
 *  into the system prompt ("reply only in <name>"). */
export interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "uk", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "pl", name: "Polish", native: "Polski", flag: "🇵🇱" },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0];

export function getLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE;
}

/** Reverse lookup: the language NAME stored on a conversation -> its ISO code
 *  (used to tell the TTS engine which language the reply is in). */
export function codeFromName(name: string): string {
  return LANGUAGES.find((l) => l.name === name)?.code ?? "en";
}

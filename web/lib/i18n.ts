"use client";

import { useLanguage } from "./useLanguage";
import { BRAND } from "./brand";

/* UI localization. The same language picker that sets the chat language also
   translates the interface. Add a language by adding its dictionary below;
   missing keys fall back to English. */

type Dict = Record<string, string>;

const en: Dict = {
  // landing
  "landing.eyebrow": "Local AI characters · private, on your device",
  "landing.title1": "Talk to anyone.",
  "landing.title2": "On your own machine.",
  "landing.subtitle":
    "Pick a character and start chatting. The AI runs entirely on your computer — nothing leaves your device, no cloud, no limits.",
  "landing.cta": "Get started",
  "landing.ctaReady": "Open characters",
  "landing.f_private": "100% private",
  "landing.f_gpu": "Runs on your GPU",
  "landing.f_free": "No subscription",
  // onboarding
  "onb.welcome": "Welcome to",
  "onb.welcome_body":
    "A place to talk with AI characters that live entirely on your own computer. Let's get you set up — it only takes a minute.",
  "onb.how_title": "How it works",
  "onb.how1_t": "Activate once",
  "onb.how1_b": "Install a tiny helper and download the model. Takes a couple of minutes.",
  "onb.how2_t": "Pick a character",
  "onb.how2_b": "Browse a cast of personalities — each with its own voice and vibe.",
  "onb.how3_t": "Just talk",
  "onb.how3_b": "Chat freely. Replies are generated live, right on your machine.",
  "onb.private_title": "Yours, and only yours",
  "onb.private_body":
    "After setup, everything runs offline on your GPU. Your conversations never touch a server — there's nothing to leak, sell, or rate-limit.",
  "onb.b_local": "Local inference",
  "onb.b_nodata": "No data leaves your device",
  "onb.b_unlimited": "Unlimited chats",
  "onb.activate_title": "Let's activate your stack",
  "onb.activate_title_ready": "You're all set",
  "onb.activate_body": "Download the engine and model. You can watch the progress right here.",
  "onb.activate_body_ready": "Your local AI is running. Time to meet the characters.",
  "onb.continue": "Continue",
  "onb.back": "Back",
  "onb.meet": "Meet the characters",
  "onb.skip": "Skip — I'm set up",
  // activate panel
  "act.title": "Activate your AI",
  "act.body":
    "Runs right in your browser on your GPU — no install, no account. We download the model once into your browser; after that it works offline.",
  "act.b1": "Model cached in your browser",
  "act.b2": "Private — runs on your GPU, nothing leaves your device",
  "act.button": "Download model & start",
  "act.ready_t": "Your stack is ready",
  "act.ready_b": "Running locally on your machine.",
  "act.installing": `Setting up ${BRAND}`,
  "act.downloading": "Downloading the model",
  "act.starting": "Starting your local server",
  "act.working": "Working…",
  // gallery
  "gal.eyebrow": "Characters",
  "gal.title": "Who do you want to talk to?",
  "gal.subtitle":
    "Each character runs live on your machine. Pick one and start a conversation — switch any time.",
  "gal.chatlang": "Chat language",
  // card
  "card.start": "Start chatting",
  "card.locked": "Activate to unlock",
  // chat
  "chat.new": "New chat",
  "chat.history": "History",
  "chat.connecting": "connecting…",
  "chat.online": "online · local",
  "chat.placeholder": "Message {name}…",
  "chat.waking": "Waking up the character…",
  "chat.back": "Back to characters",
  "chat.newchat": "New chat",
};

const ru: Dict = {
  "landing.eyebrow": "Локальные AI-персонажи · приватно, на устройстве",
  "landing.title1": "Говори с кем угодно.",
  "landing.title2": "На своём компьютере.",
  "landing.subtitle":
    "Выбери персонажа и начни общение. ИИ работает полностью на твоём компьютере — ничего не уходит наружу, без облака и лимитов.",
  "landing.cta": "Начать",
  "landing.ctaReady": "К персонажам",
  "landing.f_private": "100% приватно",
  "landing.f_gpu": "На твоей видеокарте",
  "landing.f_free": "Без подписки",
  "onb.welcome": "Добро пожаловать в",
  "onb.welcome_body":
    "Место для общения с ИИ-персонажами, которые работают целиком на твоём компьютере. Давай всё настроим — это займёт минуту.",
  "onb.how_title": "Как это работает",
  "onb.how1_t": "Активируй один раз",
  "onb.how1_b": "Поставь небольшой помощник и скачай модель. Пара минут.",
  "onb.how2_t": "Выбери персонажа",
  "onb.how2_b": "Галерея характеров — у каждого свой голос и настроение.",
  "onb.how3_t": "Просто общайся",
  "onb.how3_b": "Болтай свободно. Ответы генерятся вживую, прямо на твоей машине.",
  "onb.private_title": "Только твоё",
  "onb.private_body":
    "После настройки всё работает офлайн на твоей видеокарте. Переписка не уходит на сервер — нечего слить, продать или ограничить.",
  "onb.b_local": "Локальный инференс",
  "onb.b_nodata": "Данные не покидают устройство",
  "onb.b_unlimited": "Безлимитные чаты",
  "onb.activate_title": "Активируем стек",
  "onb.activate_title_ready": "Всё готово",
  "onb.activate_body": "Скачаем движок и модель. Прогресс виден прямо здесь.",
  "onb.activate_body_ready": "Локальный ИИ запущен. Пора знакомиться с персонажами.",
  "onb.continue": "Дальше",
  "onb.back": "Назад",
  "onb.meet": "К персонажам",
  "onb.skip": "Пропустить — всё установлено",
  "act.title": "Активируй ИИ",
  "act.body":
    "Работает прямо в браузере на твоей видеокарте — без установки и аккаунта. Модель скачается один раз в браузер, дальше работает офлайн.",
  "act.b1": "Модель кешируется в браузере",
  "act.b2": "Приватно — на твоей видеокарте, ничего не уходит наружу",
  "act.button": "Скачать модель и начать",
  "act.ready_t": "Стек готов",
  "act.ready_b": "Работает локально на твоей машине.",
  "act.installing": `Настройка ${BRAND}`,
  "act.downloading": "Скачивание модели",
  "act.starting": "Запуск локального сервера",
  "act.working": "Работаю…",
  "gal.eyebrow": "Персонажи",
  "gal.title": "С кем хочешь поговорить?",
  "gal.subtitle":
    "Каждый персонаж работает локально на твоей машине. Выбери и начни диалог — переключайся в любой момент.",
  "gal.chatlang": "Язык чата",
  "card.start": "Начать чат",
  "card.locked": "Активируй, чтобы открыть",
  "chat.new": "Новый чат",
  "chat.history": "История",
  "chat.connecting": "подключение…",
  "chat.online": "онлайн · локально",
  "chat.placeholder": "Сообщение для {name}…",
  "chat.waking": "Бужу персонажа…",
  "chat.back": "К персонажам",
  "chat.newchat": "Новый чат",
};

const DICTS: Record<string, Dict> = { en, ru };

export type TFn = (key: string, vars?: Record<string, string>) => string;

/** Hook returning a translator for the currently selected language.
 *  Default is English; the whole UI (and chats) follow the picked language. */
export function useT(): TFn {
  const { code } = useLanguage();
  const d = DICTS[code] ?? en;
  return (key, vars) => {
    let s = d[key] ?? en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    return s;
  };
}

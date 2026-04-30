/// <reference types="vite/client" />

interface TelegramWebAppLike {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
}

interface Window {
  Telegram?: { WebApp?: TelegramWebAppLike };
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

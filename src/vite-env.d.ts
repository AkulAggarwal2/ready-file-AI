/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LLM?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_ENABLE_ON_DEVICE_AI?: string;
}

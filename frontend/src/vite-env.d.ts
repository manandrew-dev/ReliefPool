/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORACLE_URL?: string;
  readonly VITE_PROGRAM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

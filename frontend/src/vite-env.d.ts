/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_ORACLE_URL?: string;
  readonly VITE_ORACLE_MOCK?: string;
  readonly VITE_PROGRAM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

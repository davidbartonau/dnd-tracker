/// <reference types="vite/client" />

declare module 'firebase/functions' {
  import { FirebaseApp } from 'firebase/app';

  export interface Functions {
    app: FirebaseApp;
  }

  export interface HttpsCallableResult<T> {
    readonly data: T;
  }

  export interface HttpsCallable<RequestData, ResponseData> {
    (data?: RequestData): Promise<HttpsCallableResult<ResponseData>>;
  }

  export function getFunctions(app?: FirebaseApp, regionOrCustomDomain?: string): Functions;
  export function httpsCallable<RequestData = unknown, ResponseData = unknown>(
    functionsInstance: Functions,
    name: string
  ): HttpsCallable<RequestData, ResponseData>;
}

declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

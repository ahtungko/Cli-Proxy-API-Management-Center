export interface BackupSource {
  appVersion: string;
  apiBase: string;
  serverVersion: string | null;
}

export interface BackupData {
  localStorage?: Record<string, string>;
  config?: Record<string, unknown>;
  authFiles?: Array<{
    name: string;
    type?: string;
    provider?: string;
    content: string;
  }>;
  auth?: {
    apiBase: string;
    managementKey: string;
    rememberPassword: boolean;
  };
  usage?: Record<string, unknown>;
}

export interface BackupPayload {
  version: 1 | 2;
  format: 'cpamc-backup';
  createdAt: string;
  source: BackupSource;
  data: BackupData | string;
}

export interface BackupScope {
  localStorage: boolean;
  config: boolean;
  authFiles: boolean;
  usage: boolean;
}

export interface WebdavFileInfo {
  href: string;
  displayName: string;
  contentLength: number;
  lastModified: string;
  isCollection: boolean;
}

export interface WebdavConnectionConfig {
  serverUrl: string;
  username: string;
  password: string;
  basePath: string;
}

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

export type AutoBackupInterval = '5m' | '30m' | '24h' | '3d';

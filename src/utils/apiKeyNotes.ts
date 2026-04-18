/**
 * Client-side storage for API key notes/comments
 * Uses per-config scoped storage with persisted row identity and salted key digests.
 */

import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { useAuthStore } from '@/stores/useAuthStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { STORAGE_KEY_AUTH } from '@/utils/constants';

const STORAGE_KEY_PREFIX = 'api-key-notes:v2:';
const STORAGE_FILE_VERSION = 3;

export interface StoredRow {
  rowId: string;
  keyDigest: string;
}

export interface StoredNote extends StoredRow {
  note: string;
  updatedAt: number;
}

export interface StoredNotesFile {
  version: 3;
  configScope: string;
  salt: string;
  rows: StoredRow[];
  entries: StoredNote[];
}

interface LegacyStoredNotesFile {
  version?: number;
  configScope?: unknown;
  salt?: unknown;
  rows?: unknown;
  entries?: unknown;
}

interface PersistedAuthStoreState {
  state?: {
    apiBase?: string;
  };
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function computeKeyDigest(apiKey: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${apiKey}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function getPersistedApiBase(): string {
  const liveApiBase = normalizeApiBase(useAuthStore.getState().apiBase);
  if (liveApiBase) return liveApiBase;

  const persisted = obfuscatedStorage.getItem<PersistedAuthStoreState>(STORAGE_KEY_AUTH);
  const persistedApiBase = normalizeApiBase(persisted?.state?.apiBase ?? '');
  if (persistedApiBase) return persistedApiBase;

  return detectApiBaseFromLocation();
}

function getConfigScope(): string {
  const apiBase = getPersistedApiBase() || 'default';
  return `${apiBase}/config.yaml`;
}

function getStorageKey(configScope = getConfigScope()): string {
  return STORAGE_KEY_PREFIX + configScope;
}

function createEmptyNotesFile(configScope = getConfigScope()): StoredNotesFile {
  return {
    version: STORAGE_FILE_VERSION,
    configScope,
    salt: generateSalt(),
    rows: [],
    entries: [],
  };
}

function isStoredRow(value: unknown): value is StoredRow {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as StoredRow).rowId === 'string' &&
      (value as StoredRow).rowId &&
      typeof (value as StoredRow).keyDigest === 'string' &&
      (value as StoredRow).keyDigest
  );
}

function isStoredNote(value: unknown): value is StoredNote {
  return Boolean(
    isStoredRow(value) &&
      typeof (value as StoredNote).note === 'string' &&
      (value as StoredNote).note.trim() &&
      typeof (value as StoredNote).updatedAt === 'number' &&
      Number.isFinite((value as StoredNote).updatedAt)
  );
}

function normalizeStoredRows(rows: unknown[], fallbackEntries: StoredNote[]): StoredRow[] {
  const normalizedRows = rows.filter(isStoredRow);
  const mergedRows = [
    ...normalizedRows,
    ...fallbackEntries.map(({ rowId, keyDigest }) => ({ rowId, keyDigest })),
  ];
  const seenRowIds = new Set<string>();

  return mergedRows.filter((row) => {
    if (seenRowIds.has(row.rowId)) return false;
    seenRowIds.add(row.rowId);
    return true;
  });
}

function normalizeStoredEntries(entries: unknown[]): StoredNote[] {
  const normalizedEntries = entries.filter(isStoredNote);
  const dedupedByRowId = new Map<string, StoredNote>();

  for (const entry of normalizedEntries) {
    dedupedByRowId.set(entry.rowId, entry);
  }

  return Array.from(dedupedByRowId.values());
}

function migrateNotesFile(value: unknown, configScope = getConfigScope()): StoredNotesFile {
  const fallback = createEmptyNotesFile(configScope);
  if (!value || typeof value !== 'object') return fallback;

  const parsed = value as LegacyStoredNotesFile;
  const entries = Array.isArray(parsed.entries) ? normalizeStoredEntries(parsed.entries) : [];
  const rows = Array.isArray(parsed.rows) ? normalizeStoredRows(parsed.rows, entries) : normalizeStoredRows([], entries);
  const salt = typeof parsed.salt === 'string' && parsed.salt ? parsed.salt : generateSalt();

  return {
    version: STORAGE_FILE_VERSION,
    configScope,
    salt,
    rows,
    entries: entries.filter((entry) => rows.some((row) => row.rowId === entry.rowId)),
  };
}

function loadNotesFile(configScope = getConfigScope()): StoredNotesFile {
  try {
    const stored = localStorage.getItem(getStorageKey(configScope));
    if (!stored) {
      return createEmptyNotesFile(configScope);
    }

    const parsed = JSON.parse(stored) as unknown;
    return migrateNotesFile(parsed, configScope);
  } catch (error) {
    console.error('Failed to load API key notes file, initializing new file:', error);
    return createEmptyNotesFile(configScope);
  }
}

function saveNotesFile(file: StoredNotesFile): void {
  try {
    localStorage.setItem(
      getStorageKey(file.configScope),
      JSON.stringify({
        ...file,
        version: STORAGE_FILE_VERSION,
      })
    );
  } catch (error) {
    console.error('Failed to save API key notes file:', error);
  }
}

function upsertStoredRow(file: StoredNotesFile, rowId: string, keyDigest: string): void {
  const existingIndex = file.rows.findIndex((row) => row.rowId === rowId);
  if (existingIndex >= 0) {
    file.rows[existingIndex] = { rowId, keyDigest };
    return;
  }

  file.rows.push({ rowId, keyDigest });
}

export async function syncApiKeyRows(apiKeys: string[]): Promise<string[]> {
  const file = loadNotesFile();
  const digests = await Promise.all(apiKeys.map((apiKey) => computeKeyDigest(apiKey, file.salt)));
  const availableRowsByDigest = new Map<string, string[]>();
  const notedRowIds = new Set(file.entries.map((entry) => entry.rowId));

  for (const row of file.rows) {
    if (!availableRowsByDigest.has(row.keyDigest)) {
      availableRowsByDigest.set(row.keyDigest, []);
    }
    availableRowsByDigest.get(row.keyDigest)?.push(row.rowId);
  }

  for (const rowIds of availableRowsByDigest.values()) {
    rowIds.sort((left, right) => Number(notedRowIds.has(right)) - Number(notedRowIds.has(left)));
  }

  const nextRows: StoredRow[] = digests.map((keyDigest) => {
    const existingRowId = availableRowsByDigest.get(keyDigest)?.shift();
    return {
      rowId: existingRowId || generateRowId(),
      keyDigest,
    };
  });

  const visibleRowIds = new Set(nextRows.map((row) => row.rowId));
  const preservedRows = file.rows.filter((row) => !visibleRowIds.has(row.rowId));
  file.rows = [...nextRows, ...preservedRows];
  for (const entry of file.entries) {
    const matchingRow = nextRows.find((row) => row.rowId === entry.rowId);
    if (matchingRow) {
      entry.keyDigest = matchingRow.keyDigest;
    }
  }

  saveNotesFile(file);
  return nextRows.map((row) => row.rowId);
}

export function getApiKeyNote(rowId: string): string {
  const file = loadNotesFile();
  return file.entries.find((entry) => entry.rowId === rowId)?.note || '';
}

export async function setApiKeyNote(rowId: string, apiKey: string, note: string): Promise<void> {
  const file = loadNotesFile();
  const keyDigest = await computeKeyDigest(apiKey, file.salt);
  const trimmedNote = note.trim();

  upsertStoredRow(file, rowId, keyDigest);
  file.entries = file.entries.filter((entry) => entry.rowId !== rowId);

  if (trimmedNote) {
    file.entries.push({
      rowId,
      keyDigest,
      note: trimmedNote,
      updatedAt: Date.now(),
    });
  }

  saveNotesFile(file);
}

export function deleteApiKeyNote(rowId: string): void {
  const file = loadNotesFile();
  file.rows = file.rows.filter((row) => row.rowId !== rowId);
  file.entries = file.entries.filter((entry) => entry.rowId !== rowId);
  saveNotesFile(file);
}

export function clearAllApiKeyNotes(): void {
  try {
    localStorage.removeItem(getStorageKey());
  } catch (error) {
    console.error('Failed to clear API key notes:', error);
  }
}

export function exportApiKeyNotes(): string {
  const file = loadNotesFile();
  return JSON.stringify(file, null, 2);
}

export async function importApiKeyNotes(
  jsonString: string,
  currentKeys: Array<{ rowId: string; apiKey: string }>
): Promise<{ imported: number; unmatched: number }> {
  try {
    const importedRaw = JSON.parse(jsonString) as unknown;
    const imported = migrateNotesFile(importedRaw);
    const file = loadNotesFile();
    const currentDigests = await Promise.all(
      currentKeys.map(async ({ rowId, apiKey }) => ({
        rowId,
        importedDigest: await computeKeyDigest(apiKey, imported.salt),
        currentDigest: await computeKeyDigest(apiKey, file.salt),
      }))
    );

    const rowsByImportedDigest = new Map<string, Array<{ rowId: string; currentDigest: string }>>();
    for (const current of currentDigests) {
      if (!rowsByImportedDigest.has(current.importedDigest)) {
        rowsByImportedDigest.set(current.importedDigest, []);
      }
      rowsByImportedDigest.get(current.importedDigest)?.push({
        rowId: current.rowId,
        currentDigest: current.currentDigest,
      });
    }

    let importedCount = 0;
    let unmatchedCount = 0;

    for (const importedEntry of imported.entries) {
      const matchingRows = rowsByImportedDigest.get(importedEntry.keyDigest) || [];
      const matchingRow = matchingRows.shift();

      if (!matchingRow) {
        unmatchedCount++;
        continue;
      }

      upsertStoredRow(file, matchingRow.rowId, matchingRow.currentDigest);
      file.entries = file.entries.filter((entry) => entry.rowId !== matchingRow.rowId);
      file.entries.push({
        rowId: matchingRow.rowId,
        keyDigest: matchingRow.currentDigest,
        note: importedEntry.note.trim(),
        updatedAt: Number.isFinite(importedEntry.updatedAt)
          ? importedEntry.updatedAt
          : Date.now(),
      });
      importedCount++;
    }

    saveNotesFile(file);
    return { imported: importedCount, unmatched: unmatchedCount };
  } catch (error) {
    console.error('Failed to import API key notes:', error);
    throw new Error('Failed to import notes. Invalid JSON format.');
  }
}

export function generateRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

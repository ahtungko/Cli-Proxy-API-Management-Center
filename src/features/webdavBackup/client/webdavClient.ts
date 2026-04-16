import type { WebdavConnectionConfig, WebdavFileInfo } from '../types';
import { apiClient } from '@/services/api/client';
import { parsePropfindResponse } from './xmlParser';
import { normalizeServerUrl, normalizeDavPath } from '../utils';

/**
 * 通过后端 /v0/management/api-call 端点中转 WebDAV 请求，绕过浏览器 CORS 限制。
 *
 * 后端接收：{ method, url, header, data }
 * 后端返回：{ status_code, header, body }
 */

interface ApiCallResponse {
  status_code: number;
  header: Record<string, string[]>;
  body: string;
}

function createAuthHeader(username: string, password: string): string {
  const encoded = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (let i = 0; i < encoded.length; i++) {
    binary += String.fromCharCode(encoded[i]);
  }
  return 'Basic ' + btoa(binary);
}

function buildDirUrl(config: WebdavConnectionConfig): string {
  return normalizeServerUrl(config.serverUrl) + normalizeDavPath(config.basePath);
}

function buildFileUrl(config: WebdavConnectionConfig, filename: string): string {
  const base = normalizeServerUrl(config.serverUrl);
  const davPath = normalizeDavPath(config.basePath);
  const cleanFile = filename.startsWith('/') ? filename.slice(1) : filename;
  return `${base}${davPath}${cleanFile}`;
}

function baseHeaders(config: WebdavConnectionConfig): Record<string, string> {
  return {
    Authorization: createAuthHeader(config.username, config.password),
  };
}

function propfindHeaders(config: WebdavConnectionConfig, depth: '0' | '1'): Record<string, string> {
  return {
    ...baseHeaders(config),
    Depth: depth,
    Accept: 'application/xml, text/xml; q=0.9, */*; q=0.8',
    'Content-Type': 'application/xml; charset=utf-8',
  };
}

async function relay(
  method: string,
  url: string,
  headers: Record<string, string>,
  data?: string
): Promise<ApiCallResponse> {
  const resp = await apiClient.post<ApiCallResponse>('/api-call', {
    method,
    url,
    header: headers,
    data: data ?? '',
  });

  // api-call 总是返回 200，实际状态码在 status_code 字段
  if (resp.status_code >= 400) {
    const detail = resp.body ? `: ${resp.body.slice(0, 200)}` : '';
    const err = new Error(`WebDAV ${method} → ${resp.status_code}${detail}`);
    (err as Error & { statusCode: number }).statusCode = resp.status_code;
    throw err;
  }

  return resp;
}

const PROPFIND_RESOURCETYPE =
  '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>';

const PROPFIND_LIST =
  '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getlastmodified/><resourcetype/></prop></propfind>';

export const webdavClient = {
  async testConnection(config: WebdavConnectionConfig): Promise<void> {
    const resp = await relay(
      'PROPFIND',
      buildDirUrl(config),
      propfindHeaders(config, '0'),
      PROPFIND_RESOURCETYPE
    );
    if (typeof resp.body === 'string' && resp.body.trim()) {
      parsePropfindResponse(resp.body);
    }
  },

  async ensureDirectory(config: WebdavConnectionConfig): Promise<void> {
    const url = buildDirUrl(config);
    const headers = baseHeaders(config);

    try {
      const resp = await relay(
        'PROPFIND',
        url,
        propfindHeaders(config, '0'),
        PROPFIND_RESOURCETYPE
      );
      if (typeof resp.body === 'string' && resp.body.trim()) {
        parsePropfindResponse(resp.body);
      }
    } catch (err: unknown) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 404 || code === 409) {
        await relay('MKCOL', url, headers);
      } else {
        throw err;
      }
    }
  },

  async putFile(config: WebdavConnectionConfig, filename: string, content: string): Promise<void> {
    await relay(
      'PUT',
      buildFileUrl(config, filename),
      { ...baseHeaders(config), 'Content-Type': 'application/json; charset=utf-8' },
      content
    );
  },

  async getFile(config: WebdavConnectionConfig, filename: string): Promise<string> {
    const resp = await relay('GET', buildFileUrl(config, filename), baseHeaders(config));
    return resp.body;
  },

  async listDirectory(config: WebdavConnectionConfig): Promise<WebdavFileInfo[]> {
    const resp = await relay(
      'PROPFIND',
      buildDirUrl(config),
      propfindHeaders(config, '1'),
      PROPFIND_LIST
    );
    if (typeof resp.body !== 'string' || resp.body.length === 0) {
      console.warn('[WebDAV] PROPFIND returned empty body, status:', resp.status_code);
      return [];
    }
    const allItems = parsePropfindResponse(resp.body);
    return allItems.filter((item) => !item.isCollection);
  },

  async deleteFile(config: WebdavConnectionConfig, filename: string): Promise<void> {
    await relay('DELETE', buildFileUrl(config, filename), baseHeaders(config));
  },
};

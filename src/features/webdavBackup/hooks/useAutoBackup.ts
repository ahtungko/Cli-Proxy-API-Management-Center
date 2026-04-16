import { useEffect, useRef } from 'react';
import { useWebdavStore } from '../store/useWebdavStore';
import { useBackupActions } from './useBackupActions';
import { AUTO_BACKUP_INTERVALS } from '../constants';

export function useAutoBackup() {
  const { backup } = useBackupActions();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autoBackupEnabled = useWebdavStore((s) => s.autoBackupEnabled);
  const autoBackupInterval = useWebdavStore((s) => s.autoBackupInterval);
  const serverUrl = useWebdavStore((s) => s.connection.serverUrl);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!autoBackupEnabled || !serverUrl) return;

    const intervalConfig = AUTO_BACKUP_INTERVALS.find((i) => i.value === autoBackupInterval);
    if (!intervalConfig) return;
    const intervalMs = intervalConfig.ms;

    // 读取快照而非订阅，避免 backup 成功后 lastBackupTime 变化触发重新执行
    const lastBackupTime = useWebdavStore.getState().lastBackupTime;
    const lastTime = lastBackupTime ? new Date(lastBackupTime).getTime() : 0;
    const elapsed = Date.now() - lastTime;

    if (elapsed >= intervalMs) {
      backup();
    }

    timerRef.current = setInterval(() => {
      backup();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoBackupEnabled, autoBackupInterval, serverUrl, backup]);
}

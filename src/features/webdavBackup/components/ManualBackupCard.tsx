import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Select } from '@/components/ui/Select';
import { useNotificationStore } from '@/stores';
import { useWebdavStore } from '../store/useWebdavStore';
import { useBackupActions } from '../hooks/useBackupActions';
import { MAX_BACKUP_COUNT_OPTIONS } from '../constants';
import type { AutoBackupInterval } from '../types';

const SCOPE_ITEMS = ['localStorage', 'config', 'authFiles', 'usage'] as const;

export function ManualBackupCard() {
  const { t } = useTranslation();
  const { backup, exportLocal } = useBackupActions();
  const { showConfirmation } = useNotificationStore();

  const backupScope = useWebdavStore((s) => s.backupScope);
  const setBackupScope = useWebdavStore((s) => s.setBackupScope);
  const isBackingUp = useWebdavStore((s) => s.isBackingUp);
  const serverUrl = useWebdavStore((s) => s.connection.serverUrl);

  const autoBackupEnabled = useWebdavStore((s) => s.autoBackupEnabled);
  const autoBackupInterval = useWebdavStore((s) => s.autoBackupInterval);
  const maxBackupCount = useWebdavStore((s) => s.maxBackupCount);
  const lastBackupTime = useWebdavStore((s) => s.lastBackupTime);
  const setAutoBackupEnabled = useWebdavStore((s) => s.setAutoBackupEnabled);
  const setAutoBackupInterval = useWebdavStore((s) => s.setAutoBackupInterval);
  const setMaxBackupCount = useWebdavStore((s) => s.setMaxBackupCount);

  const intervalOptions = [
    { value: '5m', label: t('backup.interval_5m') },
    { value: '30m', label: t('backup.interval_30m') },
    { value: '24h', label: t('backup.interval_24h') },
    { value: '3d', label: t('backup.interval_3d') },
  ] as const;

  const maxCountOptions = MAX_BACKUP_COUNT_OPTIONS.map((n) => ({
    value: String(n),
    label: n === 0 ? t('backup.max_count_unlimited') : String(n),
  }));

  return (
    <Card title={t('backup.manual_title')} subtitle={t('backup.manual_subtitle')}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 备份范围 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SCOPE_ITEMS.map((key) => (
            <div key={key}>
              <ToggleSwitch
                label={t(`backup.scope_${key}`)}
                checked={backupScope[key]}
                onChange={(val) => {
                  if (key === 'config' && val) {
                    showConfirmation({
                      title: t('backup.config_warning_title'),
                      message: t('backup.config_warning_message'),
                      confirmText: t('backup.config_warning_confirm'),
                      variant: 'danger',
                      onConfirm: () => setBackupScope({ config: true }),
                    });
                  } else {
                    setBackupScope({ [key]: val });
                  }
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, paddingLeft: 44 }}>
                {t(`backup.scope_${key}_detail`)}
              </div>
            </div>
          ))}

          {/* 分隔线 */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '-3px 0' }} />

          {/* 自动备份 */}
          <ToggleSwitch
            label={t('backup.auto_enable')}
            checked={autoBackupEnabled}
            onChange={setAutoBackupEnabled}
            disabled={!serverUrl}
          />
        </div>

        <div
          style={{
            fontSize: 12,
            padding: '6px 12px',
            marginTop: -4,
            paddingLeft: 44,
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--text-primary)',
            opacity: 0.75,
            borderRadius: 6,
            borderLeft: '3px solid rgba(239, 68, 68, 0.4)',
          }}
        >
          {t('backup.auto_browser_hint')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{t('backup.auto_interval')}</span>
            <div style={{ width: 140 }}>
              <Select
                value={autoBackupInterval}
                options={[...intervalOptions]}
                onChange={(val) => setAutoBackupInterval(val as AutoBackupInterval)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {t('backup.max_count_label')}
            </span>
            <div style={{ width: 100 }}>
              <Select
                value={String(maxBackupCount)}
                options={maxCountOptions}
                onChange={(val) => setMaxBackupCount(Number(val))}
              />
            </div>
          </div>
        </div>
        {lastBackupTime && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('backup.last_backup')}: {new Date(lastBackupTime).toLocaleString()}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            opacity: 0.7,
            borderRadius: 6,
            lineHeight: 1.6,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div>
            <strong>{t('backup.auto_label_1')}</strong>
            {t('backup.auto_note_1')}
          </div>
          <div>
            <strong>{t('backup.auto_label_2')}</strong>
            {t('backup.auto_note_2')}
          </div>
          <div>
            <strong>{t('backup.auto_label_3')}</strong>
            {t('backup.auto_note_3')}
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={exportLocal}>
            {t('backup.export_local')}
          </Button>
          <Button variant="primary" onClick={backup} loading={isBackingUp} disabled={!serverUrl}>
            {t('backup.backup_now')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

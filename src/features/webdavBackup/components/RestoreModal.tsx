import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { BackupScope } from '../types';

interface RestoreModalProps {
  open: boolean;
  onClose: () => void;
  onRestore: (scope: BackupScope) => void;
  loading: boolean;
  filename: string;
}

export function RestoreModal({ open, onClose, onRestore, loading, filename }: RestoreModalProps) {
  const { t } = useTranslation();

  const [scope, setScope] = useState<BackupScope>({
    localStorage: true,
    config: false,
    authFiles: false,
    usage: true,
  });

  // 每次打开弹窗时重置为默认值
  useEffect(() => {
    if (open) setScope({ localStorage: true, config: false, authFiles: false, usage: true });
  }, [open]);

  const scopeItems: { key: keyof BackupScope; label: string; hint: string }[] = [
    {
      key: 'localStorage',
      label: t('backup.scope_preferences'),
      hint: t('backup.scope_preferences_hint'),
    },
    { key: 'config', label: t('backup.scope_config'), hint: t('backup.scope_config_restore_hint') },
    {
      key: 'authFiles',
      label: t('backup.scope_authFiles'),
      hint: t('backup.scope_authFiles_restore_hint'),
    },
    { key: 'usage', label: t('backup.scope_usage'), hint: t('backup.scope_usage_hint') },
  ];

  const hasSelection = Object.values(scope).some(Boolean);

  return (
    <Modal
      open={open}
      title={t('backup.restore_title')}
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onRestore(scope)}
            loading={loading}
            disabled={!hasSelection}
          >
            {t('backup.restore_confirm')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {t('backup.restore_from')}: <strong>{filename}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scopeItems.map((item) => (
            <div key={item.key}>
              <ToggleSwitch
                label={item.label}
                checked={scope[item.key]}
                onChange={(val) => setScope((prev) => ({ ...prev, [item.key]: val }))}
                disabled={loading}
              />
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, paddingLeft: 44 }}>
                {item.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

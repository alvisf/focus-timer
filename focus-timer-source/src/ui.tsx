import { ReactNode, useEffect, useState } from 'react';
import { Sheet, Toggle as F7Toggle } from 'framework7-react';
import { t } from './i18n';

export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => {
      cancelAnimationFrame(id);
      // Parent may unmount us without closing: clear F7's shared backdrop state.
      document.querySelectorAll('.sheet-backdrop').forEach((b) => b.classList.remove('backdrop-in'));
      document.documentElement.classList.remove('with-modal-sheet');
    };
  }, []);
  return (
    <Sheet opened={open} className="modal" backdrop closeByBackdropClick closeOnEscape swipeToClose onSheetClosed={onClose} aria-label={title}>
      <div className="modal-handle" aria-hidden="true" />
      <div className="modal-body">
        <h2>{title}</h2>
        {children}
      </div>
    </Sheet>
  );
}

export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="row switch">
      <span>{label}</span>
      <F7Toggle checked={checked} disabled={disabled} onToggleChange={(v: boolean) => onChange(v)} />
    </label>
  );
}

export const closeLabel = () => t('closeBtn');
export const keyName = (k: string) => (k === ' ' ? t('keySpace') : k.length === 1 ? k.toUpperCase() : k);
export const normKey = (k: string) => (k.length === 1 ? k.toLowerCase() : k);

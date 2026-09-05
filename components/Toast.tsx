'use client';

import { useCallback, useState } from 'react';

export interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'warn';
}

let nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, type: ToastItem['type'] = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return { toasts, toast };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div id="toast">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item ${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

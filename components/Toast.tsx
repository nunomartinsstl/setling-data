import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export const toast = {
  success: (message: string, duration?: number) => window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message, duration } })),
  error: (message: string, duration?: number) => window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'error', message, duration } })),
  info: (message: string, duration?: number) => window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'info', message, duration } })),
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<{ id: number; type: ToastType; message: string; duration?: number }[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, e.detail.duration || 4000);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 p-4 pointer-events-none w-full max-w-sm">
        {toasts.map(t => (
            <div key={t.id} className={`pointer-events-auto flex items-start gap-3 px-4 py-4 rounded-xl shadow-lg border backdrop-blur-md animate-in slide-in-from-top-5 fade-in duration-300 ${
                t.type === 'success' ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:border-emerald-800 dark:text-emerald-300' : 
                t.type === 'error' ? 'bg-red-50/90 border-red-200 text-red-800 dark:bg-red-900/60 dark:border-red-800 dark:text-red-300' : 
                'bg-blue-50/90 border-blue-200 text-blue-800 dark:bg-blue-900/60 dark:border-blue-800 dark:text-blue-300'
            }`}>
                {t.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : 
                 t.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : 
                 <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                <p className="font-medium text-sm flex-1">{t.message}</p>
                <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-auto p-1 opacity-60 hover:opacity-100 flex-shrink-0">
                    <X className="w-4 h-4" />
                </button>
            </div>
        ))}
    </div>
  );
};

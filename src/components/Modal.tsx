import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#030509]/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${maxWidthClass} rounded-t-2xl sm:rounded-2xl bg-[#0A101E] border border-[#D4AF37]/35 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)] overflow-hidden max-h-[90dvh] flex flex-col`}
          >
            {/* Subtle top champagne brass highlight edge */}
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#D4AF37]/75 to-transparent shrink-0" />
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] shrink-0">
              <h3 className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق النافذة"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.06] transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

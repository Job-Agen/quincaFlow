import React, { useEffect, useState } from 'react';

const COLORS = {
  card2: '#221408',
  border: '#362210',
  text: '#F5EDD8',
  amber: '#F5A623',
  muted: '#8B7B64',
};

export default function Modal({ open, onClose, title, children }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open, isMobile]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '0' : '16px',
      }}
    >
      <div
        className={isMobile ? undefined : 'modal-content'}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card2,
          border: isMobile ? 'none' : `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          padding: isMobile ? '20px 16px' : '24px',
          width: isMobile ? '100%' : undefined,
          maxHeight: isMobile ? '92vh' : '90vh',
          overflowY: 'auto',
          color: COLORS.text,
          animation: isMobile ? 'slideUp 0.25s ease-out' : undefined,
        }}
      >
        {/* Drag handle indicator for mobile */}
        {isMobile && (
          <div
            style={{
              width: '36px',
              height: '4px',
              borderRadius: '2px',
              background: COLORS.muted,
              margin: '0 auto 14px',
              opacity: 0.5,
            }}
          />
        )}

        {title && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px', color: COLORS.amber }}>{title}</h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.muted,
                cursor: 'pointer',
                fontSize: '20px',
                lineHeight: 1,
                padding: '0 4px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

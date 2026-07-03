import React from 'react';

const COLORS = {
  card: '#1A1008',
  border: '#362210',
  text: '#F5EDD8',
};

export default function Card({ children, style, title, ...props }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        padding: '16px',
        color: COLORS.text,
        ...style,
      }}
      {...props}
    >
      {title && (
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#8B7B64',
            marginBottom: '12px',
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

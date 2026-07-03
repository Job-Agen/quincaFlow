import React from 'react';

const variantStyles = {
  success: {
    background: 'rgba(46,170,107,0.15)',
    color: '#2EAA6B',
    border: '1px solid rgba(46,170,107,0.3)',
  },
  warning: {
    background: 'rgba(245,166,35,0.15)',
    color: '#F5A623',
    border: '1px solid rgba(245,166,35,0.3)',
  },
  danger: {
    background: 'rgba(217,59,42,0.15)',
    color: '#D93B2A',
    border: '1px solid rgba(217,59,42,0.3)',
  },
  info: {
    background: 'rgba(58,143,212,0.15)',
    color: '#3A8FD4',
    border: '1px solid rgba(58,143,212,0.3)',
  },
  neutral: {
    background: 'rgba(139,123,100,0.15)',
    color: '#8B7B64',
    border: '1px solid rgba(139,123,100,0.3)',
  },
};

export default function Badge({ variant = 'neutral', children, style }) {
  const v = variantStyles[variant] || variantStyles.neutral;
  return (
    <span
      style={{
        ...v,
        padding: '2px 8px',
        borderRadius: '99px',
        fontSize: '11px',
        fontWeight: 600,
        display: 'inline-block',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

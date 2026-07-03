import React from 'react';

const COLORS = {
  amber: '#F5A623',
  terra: '#D4622A',
  green: '#2EAA6B',
  red: '#D93B2A',
  blue: '#3A8FD4',
  text: '#F5EDD8',
  muted: '#8B7B64',
  border: '#362210',
  card: '#1A1008',
  card2: '#221408',
};

const variants = {
  primary: {
    background: COLORS.amber,
    color: '#0D0905',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: COLORS.amber,
    border: `1px solid ${COLORS.amber}`,
  },
  danger: {
    background: COLORS.red,
    color: COLORS.text,
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: COLORS.muted,
    border: `1px solid ${COLORS.border}`,
  },
  terra: {
    background: COLORS.terra,
    color: '#fff',
    border: 'none',
  },
  green: {
    background: COLORS.green,
    color: '#fff',
    border: 'none',
  },
};

const sizes = {
  sm: { padding: '4px 10px', fontSize: '12px', borderRadius: '6px' },
  md: { padding: '8px 16px', fontSize: '14px', borderRadius: '8px' },
  lg: { padding: '12px 24px', fontSize: '16px', borderRadius: '10px' },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  style,
  disabled,
  ...props
}) {
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;

  return (
    <button
      style={{
        ...v,
        ...s,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'opacity 0.15s',
        ...style,
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

import React from 'react';

const COLORS = {
  card: '#1A1008',
  border: '#362210',
  text: '#F5EDD8',
  muted: '#8B7B64',
  amber: '#F5A623',
};

export default function Input({ label, style, ...props }) {
  const inputStyle = {
    background: '#0D0905',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    color: COLORS.text,
    fontSize: '14px',
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    ...style,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{ fontSize: '12px', color: COLORS.muted, fontWeight: 600 }}>{label}</label>
      )}
      <input style={inputStyle} {...props} />
    </div>
  );
}

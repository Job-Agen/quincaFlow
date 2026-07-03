import React from 'react';

const COLORS = {
  border: '#362210',
  text: '#F5EDD8',
  muted: '#8B7B64',
};

export default function Select({ label, options = [], style, value, onChange, ...props }) {
  const selectStyle = {
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
    cursor: 'pointer',
    ...style,
  };

  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{ fontSize: '12px', color: COLORS.muted, fontWeight: 600 }}>{label}</label>
      )}
      <select style={selectStyle} value={value} onChange={onChange} {...props}>
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

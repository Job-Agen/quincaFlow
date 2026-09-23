'use client';
import { cloneElement, useEffect, useRef, useState } from 'react';
import { X, LoaderCircle } from 'lucide-react';

export const formatMoney = (value, currency = 'FCFA') =>
  (value / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + currency;
export function Field({ label, children, ...props }) {
  return (
    <label className="local-field">
      <span>{label}</span>
      {children ? (
        cloneElement(children, { 'aria-label': label })
      ) : (
        <input aria-label={label} {...props} />
      )}
    </label>
  );
}
export function Select({ label, children, ...props }) {
  return (
    <Field label={label}>
      <select {...props}>{children}</select>
    </Field>
  );
}
export function Button({ children, tone = '', ...props }) {
  return (
    <button type="button" className={'local-button ' + tone} {...props}>
      {children}
    </button>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="local-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="local-dialog-head">
        <h2>{title}</h2>
        <button type="button" aria-label="Fermer" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({ children, onSubmit, label = 'Enregistrer localement', disabled = false }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="local-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true);
        setError('');
        try {
          await onSubmit(values);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error ? (
        <p className="local-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="local-button success" type="submit" disabled={busy || disabled}>
        {busy ? <LoaderCircle size={18} className="local-spin" /> : null}
        {busy ? 'Sauvegarde…' : label}
      </button>
    </form>
  );
}
export function Empty({ children = 'Aucune donnée pour le moment.' }) {
  return <div className="local-empty">{children}</div>;
}
export function Amount({ value, currency }) {
  return <strong className={value < 0 ? 'negative' : ''}>{formatMoney(value, currency)}</strong>;
}
export function Bars({ rows, currency, empty = 'Aucune donnée sur cette période.' }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.length ? (
    <ul className="local-bars" aria-label="Classement par montant">
      {rows.map((row, index) => (
        <li key={row.id || row.name}>
          <div>
            <span>{row.name}</span>
            <Amount value={row.value} currency={currency} />
          </div>
          <div className="local-bar-track" aria-hidden="true">
            <span
              style={{
                width: Math.max(1, (100 * row.value) / max) + '%',
                background: ['#0968c8', '#0a9f60', '#d79620', '#865bc0', '#39889b'][index % 5],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>{empty}</Empty>
  );
}
export function Status({ product }) {
  return product.stock === 0 ? (
    <span className="local-badge red">Rupture</span>
  ) : product.stock <= product.minStock ? (
    <span className="local-badge amber">Stock faible</span>
  ) : (
    <span className="local-badge green">En stock</span>
  );
}
export function Metrics({ items, currency }) {
  return (
    <div className="local-metrics">
      {items.map(([label, value, tone = 'blue', plain = false]) => (
        <div key={label} className={'local-metric ' + tone}>
          <span>{label}</span>
          <strong>{plain ? value : formatMoney(value, currency)}</strong>
        </div>
      ))}
    </div>
  );
}

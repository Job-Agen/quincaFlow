'use client';

import { useEffect, useId } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Briques d'interface communes.
 *
 * Elles ne portent aucune couleur : tout vient des classes définies dans
 * globals.css, ce qui garde les dix écrans visuellement alignés et permet de
 * retoucher la charte en un seul endroit.
 */

export function Button({ variant = 'primary', size, block, className = '', ...props }) {
  const classes = ['btn'];
  if (variant !== 'primary') classes.push(`btn--${variant}`);
  if (size === 'sm') classes.push('btn--sm');
  if (block) classes.push('btn--block');
  if (className) classes.push(className);
  return <button type="button" {...props} className={classes.join(' ')} />;
}

export function Card({ pad, className = '', children, ...props }) {
  return (
    <div
      className={['card', pad ? 'card--pad' : '', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, action }) {
  return (
    <div className="card__head">
      <span className="card__title">{title}</span>
      {action}
    </div>
  );
}

export function Badge({ tone = 'grey', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/**
 * Champ de formulaire.
 *
 * L'identifiant est généré et relié au libellé : sans association explicite,
 * toucher le libellé sur mobile ne donne pas le focus au champ, ce qui rend la
 * saisie pénible sur un petit écran.
 */
export function Field({ label, hint, error, children, ...props }) {
  const id = useId();
  const control =
    typeof children === 'function' ? children(id) : <input id={id} className="input" {...props} />;
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      {control}
      {error ? (
        <span className="field__hint" style={{ color: 'var(--red)' }}>
          {error}
        </span>
      ) : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({ label, hint, error, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <input id={id} className={`input${error ? ' input--error' : ''}`} {...props} />}
    </Field>
  );
}

export function SelectField({ label, hint, children, ...props }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} className="input" {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, hint, ...props }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} className="input" {...props} />}
    </Field>
  );
}

/** Recherche : icône à gauche, effacement à droite dès qu'il y a du texte. */
export function SearchField({ value, onChange, placeholder = 'Rechercher…', children }) {
  return (
    <div className="input-icon">
      <Search size={17} />
      <input
        className="input"
        type="search"
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="input-icon__action"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
        >
          <X size={17} />
        </button>
      ) : (
        children
      )}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          data-active={option.value === value}
          className="segmented__item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, hint, action }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {hint ? <span className="small">{hint}</span> : null}
      {action}
    </div>
  );
}

export function Notice({ tone, icon, children }) {
  return (
    <div className={`notice${tone ? ` notice--${tone}` : ''}`}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

/** Squelette de chargement : occupe la place du contenu pour éviter un saut. */
export function Skeleton({ height = 64, count = 3 }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/**
 * Feuille modale, ancrée en bas sur mobile et centrée à partir de la tablette.
 * Le défilement de l'arrière-plan est gelé tant qu'elle est ouverte, sans quoi
 * un geste de défilement dans la feuille emporte la page en dessous.
 */
export function Sheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="sheet">
        <div className="sheet__head">
          <strong>{title}</strong>
          <button
            type="button"
            className="appbar__icon"
            style={{ color: 'var(--muted)' }}
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? (
          <div className="sheet__body" style={{ paddingTop: 0 }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

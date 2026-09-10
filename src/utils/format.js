/** Mises en forme partagées par tous les écrans. */

/** « 19 250 FCFA ». L'espace insécable évite un retour à la ligne avant la devise. */
export function money(value, currency = 'FCFA') {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

/** Montant seul, sans devise — pour les tableaux où la devise est en en-tête. */
export function amount(value) {
  const parsed = Number(value);
  return (Number.isFinite(parsed) ? parsed : 0).toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  });
}

/** Quantité : entière quand elle l'est, sinon jusqu'à trois décimales. */
export function quantity(value) {
  const parsed = Number(value) || 0;
  return parsed.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

export function shortDate(value) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function time(value) {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(value) {
  return `${shortDate(value)} · ${time(value)}`;
}

/** « aujourd'hui » / « hier » / date — utilisé pour grouper l'historique. */
export function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return shortDate(value);
}

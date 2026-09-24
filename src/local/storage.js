import { emptyStore, transact, validateStore } from './ledger';

export const STORAGE_KEY = 'quincaflow.local.v1';
export function createRepository(storage) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      throw Error(
        'Le stockage local est bloqué. Autorisez les données de ce site pour enregistrer.'
      );
    }
    if (raw === null) return emptyStore();
    try {
      return validateStore(JSON.parse(raw));
    } catch {
      throw Error(
        'La sauvegarde locale est illisible. Elle est conservée : exportez-la avant de restaurer une sauvegarde.'
      );
    }
  }
  function persist(data) {
    validateStore(data);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      throw Error(
        'Sauvegarde refusée : espace local insuffisant ou stockage bloqué. Aucune opération n’a été enregistrée. Exportez vos données et libérez de l’espace.'
      );
    }
    return data;
  }
  return {
    read,
    raw: () => storage.getItem(STORAGE_KEY),
    apply: (action, input, revision) => {
      const current = read();
      if (revision !== undefined && current.revision !== revision)
        throw Error(
          'Les données ont changé dans un autre onglet. Fermez ce formulaire puis recommencez.'
        );
      return persist(transact(current, action, input));
    },
    restore: (raw, revision) => {
      let current;
      try {
        current = read();
      } catch {
        /* A valid backup can repair a corrupted store. */
      }
      if (revision !== undefined && current && current.revision !== revision)
        throw Error('Les données ont changé. Relancez l’import.');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw Error('Le fichier n’est pas un JSON valide.');
      }
      validateStore(parsed);
      return persist({
        ...parsed,
        revision: Math.max(current?.revision || 0, parsed.revision) + 1,
      });
    },
  };
}
export async function localWrite(callback) {
  if (navigator.locks) return navigator.locks.request(STORAGE_KEY, callback);
  // Synchronous read/validate/setItem on browsers without Web Locks.
  return callback();
}
export function downloadBackup(raw, name = 'quincaflow-sauvegarde.json') {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readReceipt(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('Choisissez une photo JPEG, PNG ou WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('La photo est trop volumineuse (12 Mo maximum).');
  const bitmap = await createImageBitmap(file);
  try {
    const factor = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.65);
    if (result.length >= 600000)
      throw Error('La photo reste trop volumineuse. Choisissez une image plus petite.');
    return result;
  } finally {
    bitmap.close();
  }
}

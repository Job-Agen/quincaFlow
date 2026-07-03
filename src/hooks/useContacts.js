import { useState, useEffect } from 'react';
import storage from '../storage';

const STORAGE_KEY = 'qp_contacts';

export default function useContacts() {
  const [contacts, setContacts] = useState(() => storage.get(STORAGE_KEY, []));

  useEffect(() => {
    storage.set(STORAGE_KEY, contacts);
  }, [contacts]);

  function addContact(data) {
    const newContact = {
      ...data,
      id: crypto.randomUUID(),
      creditBalance: data.creditBalance ?? 0,
    };
    setContacts((prev) => [...prev, newContact]);
    return newContact;
  }

  function updateContact(id, data) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
  }

  function deleteContact(id) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCredit(id, delta) {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const newBalance = Math.max(0, (c.creditBalance || 0) + delta);
        return { ...c, creditBalance: newBalance };
      })
    );
  }

  return { contacts, addContact, updateContact, deleteContact, updateCredit };
}

'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Phone, Plus, Users } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Card, Empty, Notice, SearchField, Skeleton } from '@/components/ui';
import ContactSheet, { type EditingContact } from '@/components/contacts/ContactSheet';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money } from '@/utils/format';
import type { ContactRow } from '@/types';

/**
 * Écran de répertoire, partagé par les clients et les fournisseurs (§18, §23).
 *
 * Les deux fiches ne diffèrent que d'un champ — le WhatsApp du fournisseur —
 * et se comportent à l'identique. Deux écrans jumeaux divergeraient au premier
 * correctif ; un seul, paramétré, ne le peut pas.
 */
export default function ContactsScreen({
  kind,
  title,
  addLabel,
  withWhatsapp,
  emptyHint,
  ownerOnly = false,
  hrefFor,
  header,
}: {
  kind: 'customers' | 'suppliers';
  title: string;
  addLabel: string;
  withWhatsapp?: boolean;
  emptyHint?: string;
  /** Réserve l'écriture au propriétaire : vrai pour les fournisseurs (§5). */
  ownerOnly?: boolean;
  /**
   * Destination d'une ligne. Les clients ont une fiche à eux (§45), et la
   * toucher doit l'ouvrir ; les fournisseurs n'en ont pas, et la ligne ouvre
   * alors directement le formulaire.
   */
  hrefFor?: (contact: ContactRow) => string;
  /** Inséré avant la recherche : le classement des débiteurs, pour les clients. */
  header?: ReactNode;
}) {
  const [search, setSearch] = useState('');
  // `null` : aucune fiche ouverte. Un objet vide : création d'une nouvelle fiche.
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const { data, loading, error, reload } = useResource<ContactRow[]>(`/api/${kind}`, { search });
  const { isOwner, currency } = useSession();

  // Un vendeur inscrit un client au comptoir, mais ne touche pas au répertoire
  // fournisseurs : c'est avec eux que l'argent sort. L'écran est le même, le
  // droit d'écriture non — d'où le réglage porté par l'appelant.
  const canEdit = !ownerOnly || isOwner;

  return (
    <>
      <AppBar back="/more" title={title} />

      <main className="page">
        {header}
        <SearchField value={search} onChange={setSearch} placeholder="Nom ou téléphone…" />

        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={4} height={64} /> : null}

        {data ? (
          <Card>
            {data.length === 0 ? (
              <Empty
                icon={<Users size={26} className="muted" />}
                title="Répertoire vide"
                hint={emptyHint}
              />
            ) : (
              <div className="list">
                {data.map((contact) => {
                  const corps = (
                    <>
                      <span
                        className="thumb"
                        style={{ fontWeight: 800, color: 'var(--blue-dark)' }}
                      >
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="list__body">
                        <div className="list__title">{contact.name}</div>
                        {contact.phone ? (
                          <div className="list__sub">
                            <Phone size={12} style={{ verticalAlign: -1 }} /> {contact.phone}
                          </div>
                        ) : null}
                      </div>
                      {/* L'ardoise se lit depuis le répertoire : c'est la première
                        chose qu'on y cherche quand le client est devant soi (§45). */}
                      {contact.owed && contact.owed > 0 ? (
                        <div className="list__end">
                          <Badge tone="amber">{money(contact.owed, currency)}</Badge>
                        </div>
                      ) : null}
                    </>
                  );

                  const destination = hrefFor?.(contact);
                  return destination ? (
                    <Link key={contact.id} href={destination} className="list__row">
                      {corps}
                    </Link>
                  ) : (
                    <button
                      key={contact.id}
                      type="button"
                      className="list__row"
                      disabled={!canEdit}
                      onClick={() => setEditing(contact)}
                    >
                      {corps}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}
      </main>

      {canEdit ? (
        <button
          type="button"
          className="fab"
          aria-label={addLabel}
          onClick={() => setEditing({ isNew: true })}
        >
          <Plus size={26} />
        </button>
      ) : null}

      {editing ? (
        <ContactSheet
          kind={kind}
          contact={editing}
          withWhatsapp={withWhatsapp}
          addLabel={addLabel}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

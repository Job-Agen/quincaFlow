'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Card, CardHead, Notice, Sheet, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import { confirmsBusinessName } from '@/domain/business';
import { withUnit } from '@/utils/format';
import { errorMessage } from '@/utils/errors';

/** Ce que la boutique contient, tel que l'API le compte avant la suppression. */
interface Poids {
  businessName: string;
  products: number;
  sales: number;
  customers: number;
  suppliers: number;
  members: number;
}

interface Resume extends Poids {
  accountsRemoved: number;
}

/**
 * Suppression définitive de la boutique (§46).
 *
 * Elle est au bas des paramètres, repliée, et ne s'ouvre qu'à la demande : un
 * bouton rouge en permanence sous les yeux finit par ne plus être lu.
 *
 * La marche est volontairement haute. Le gérant voit d'abord ce qu'il efface —
 * en nombre de produits, de ventes, de clients —, puis il doit donner son mot
 * de passe *et* retaper le nom de sa boutique. Le premier arrête un téléphone
 * resté déverrouillé sur le comptoir ; le second arrête le propriétaire
 * lui-même, celui qui a le mot de passe et qui appuie trop vite.
 *
 * Le bouton reste désactivé tant que les deux ne sont pas donnés : on ne
 * propose pas un geste qu'on refusera ensuite.
 */
export default function ZoneDeDanger() {
  const router = useRouter();
  const { business, signOut } = useSession();
  const [ouverte, setOuverte] = useState(false);
  const [poids, setPoids] = useState<Poids | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fini, setFini] = useState<Resume | null>(null);

  const nom = poids?.businessName || business?.name || '';
  const nomConfirme = confirmsBusinessName(confirmation, nom);

  async function ouvrir() {
    setOuverte(true);
    setError(null);
    try {
      setPoids(await api.get<Poids>('/api/business'));
    } catch (issue) {
      setError(errorMessage(issue));
    }
  }

  async function supprimer() {
    setBusy(true);
    setError(null);
    try {
      setFini(
        await api.delete<Resume>('/api/business', {
          password: motDePasse,
          confirmation,
        })
      );
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  if (fini) {
    /*
     * En feuille, et non en carte au bas de l'écran.
     *
     * Le premier essai posait la confirmation sous le formulaire des
     * paramètres — qui continuait d'afficher le nom, l'adresse et un bouton
     * « Enregistrer » d'une boutique qui n'existait plus. La feuille recouvre
     * l'écran périmé et ne laisse qu'une suite possible.
     */
    const partir = () => {
      // La session est déjà close côté serveur ; on vide la nôtre et on repart
      // de l'accueil plutôt que d'un écran protégé devenu muet.
      void signOut();
      router.replace('/login');
    };

    return (
      <Sheet open title="Boutique supprimée" onClose={partir}>
        <p className="small muted">
          « {fini.businessName} » n’existe plus. {withUnit(fini.sales, 'vente')} et{' '}
          {withUnit(fini.products, 'produit')} ont été effacés.{' '}
          {fini.accountsRemoved > 1
            ? `Les ${fini.accountsRemoved} comptes qui lui étaient rattachés ont été supprimés.`
            : 'Le compte qui lui était rattaché a été supprimé.'}
        </p>
        <Button block onClick={partir}>
          Revenir à l’accueil
        </Button>
      </Sheet>
    );
  }

  if (!ouverte) {
    return (
      <Card pad className="stack" style={{ gap: 10 }}>
        <CardHead title="Zone de danger" action={<AlertTriangle size={18} className="muted" />} />
        <p className="small muted">
          Supprimer la boutique efface définitivement ses produits, ses ventes, ses clients et ses
          commandes. Rien ne peut être récupéré ensuite.
        </p>
        <Button variant="danger" block onClick={ouvrir}>
          <Trash2 size={18} />
          Supprimer ma boutique
        </Button>
      </Card>
    );
  }

  return (
    <Card pad className="stack" style={{ gap: 12 }}>
      <CardHead
        title="Supprimer ma boutique"
        action={<AlertTriangle size={18} className="muted" />}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Notice tone="error">
        Cette suppression est définitive. Il n’y a pas de corbeille, pas de retour en arrière, et
        aucune copie n’est conservée.
      </Notice>

      {poids ? (
        <>
          <p className="small muted">Seront effacés avec « {poids.businessName} » :</p>
          {/* Les compléments — « et leurs encaissements » — ont été retirés de
            chaque ligne : ils demandaient un accord qui se trompait à un seul
            exemplaire (« 1 vente et leurs encaissements »). Ils sont dits une
            fois, en dessous, dans une phrase qui vaut pour tous les comptes.
            `withUnit` accorde le reste : « 1 vente », « 184 ventes ». */}
          <ul className="danger-list small">
            <li>{withUnit(poids.sales, 'vente')}</li>
            <li>{withUnit(poids.products, 'produit')}</li>
            <li>{withUnit(poids.customers, 'client')}</li>
            <li>{withUnit(poids.suppliers, 'fournisseur')}</li>
            <li>{withUnit(poids.members, 'compte')} rattaché à cette boutique</li>
          </ul>
          <p className="small muted">
            Les encaissements, les mouvements de stock, les ardoises et les commandes fournisseurs
            partent avec.
          </p>
        </>
      ) : null}

      <TextField
        label="Votre mot de passe"
        type="password"
        autoComplete="current-password"
        value={motDePasse}
        onChange={(event) => setMotDePasse(event.target.value)}
      />

      <TextField
        label={`Tapez « ${nom} » pour confirmer`}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />

      <Button
        variant="danger"
        block
        disabled={busy || !motDePasse || !nomConfirme}
        onClick={supprimer}
      >
        {busy ? 'Suppression…' : 'Supprimer définitivement'}
      </Button>
      <Button
        variant="ghost"
        block
        onClick={() => {
          setOuverte(false);
          setMotDePasse('');
          setConfirmation('');
          setError(null);
        }}
      >
        Annuler
      </Button>
    </Card>
  );
}

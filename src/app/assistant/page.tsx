'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Send, Sparkles, X } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Button, Notice } from '@/components/ui';
import { api } from '@/client/api';
import { useSession } from '@/client/session';
import type { Proposition } from '@/domain/assistant';
import { errorMessage } from '@/utils/errors';

/**
 * L'assistant de la boutique (§71).
 *
 * Un gérant au comptoir demande, l'assistant répond. Et quand il faut écrire
 * — une vente, une dépense, un réassort —, l'assistant **propose** : la carte
 * dit exactement ce qui va se passer, et rien ne bouge avant l'appui.
 *
 * Le fil vit dans cet écran et nulle part ailleurs : on le renvoie entier à
 * chaque question. Le quitter l'efface, ce qui est le bon défaut pour un
 * téléphone de comptoir qui passe de main en main.
 */

interface Bulle {
  role: 'user' | 'assistant';
  texte: string;
  /** Ce que l'application a fait après un appui : ni le gérant ni le modèle. */
  fait?: boolean;
}

const EXEMPLES = [
  'Combien j’ai vendu aujourd’hui ?',
  'Qu’est-ce que je dois racheter ?',
  'Il me reste combien de ciment ?',
  'Qui me doit de l’argent ?',
];

export default function AssistantPage() {
  const { user } = useSession();
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [question, setQuestion] = useState('');
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  // Le dernier message doit être visible : sans cela, la réponse arrive sous
  // le clavier et le gérant croit qu'il ne s'est rien passé.
  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [bulles, proposition, occupe]);

  async function demander(texte: string) {
    const propre = texte.trim();
    if (!propre || occupe) return;
    const fil: Bulle[] = [...bulles, { role: 'user', texte: propre }];
    setBulles(fil);
    setQuestion('');
    setProposition(null);
    setErreur(null);
    setOccupe(true);
    try {
      const reponse = await api.post<{ texte: string; proposition: Proposition | null }>(
        '/api/assistant',
        // Les gestes déjà faits ne repartent pas au modèle : ils n'ont de sens
        // que pour le gérant, et ils coûteraient des jetons à chaque question.
        {
          tours: fil
            .filter((bulle) => !bulle.fait)
            .map(({ role, texte: t }) => ({ role, texte: t })),
        }
      );
      if (reponse.texte) setBulles([...fil, { role: 'assistant', texte: reponse.texte }]);
      setProposition(reponse.proposition);
    } catch (souci) {
      setErreur(errorMessage(souci));
    }
    setOccupe(false);
  }

  async function valider() {
    if (!proposition || occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      const fait = await api.post<{ texte: string }>('/api/assistant/confirmer', {
        outil: proposition.outil,
        args: proposition.args,
      });
      setBulles((avant) => [...avant, { role: 'assistant', texte: fait.texte, fait: true }]);
      setProposition(null);
    } catch (souci) {
      setErreur(errorMessage(souci));
    }
    setOccupe(false);
  }

  return (
    <>
      <AppBar back="/more" title="Assistant" />

      <main className="page chat">
        {bulles.length === 0 ? (
          <div className="chat__accueil">
            <Sparkles size={30} className="muted" />
            <h2>Bonjour {(user?.name || '').split(' ')[0]}</h2>
            <p className="muted small">
              Posez votre question à voix de comptoir. Je lis vos chiffres, et je vous propose
              d’enregistrer ce qu’il faut — rien n’est écrit sans votre accord.
            </p>
            <div className="chat__exemples">
              {EXEMPLES.map((exemple) => (
                <button
                  key={exemple}
                  type="button"
                  className="chat__exemple"
                  onClick={() => demander(exemple)}
                >
                  {exemple}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {bulles.map((bulle, index) => (
          <div
            key={index}
            className={`chat__bulle chat__bulle--${bulle.role}${bulle.fait ? ' chat__bulle--fait' : ''}`}
          >
            {bulle.fait ? <Check size={15} /> : null}
            <span>{bulle.texte}</span>
          </div>
        ))}

        {occupe ? <div className="chat__bulle chat__bulle--assistant chat__patience">…</div> : null}

        {erreur ? <Notice tone="error">{erreur}</Notice> : null}

        {proposition ? (
          <div className="chat__proposition">
            <div className="chat__proposition-titre">À valider</div>
            <pre className="chat__resume">{proposition.resume}</pre>
            <div className="chat__gestes">
              <Button variant="success" block disabled={occupe} onClick={valider}>
                <Check size={18} />
                {occupe ? 'Enregistrement…' : 'Valider'}
              </Button>
              <Button variant="soft" block disabled={occupe} onClick={() => setProposition(null)}>
                <X size={18} />
                Annuler
              </Button>
            </div>
          </div>
        ) : null}

        <div ref={bas} />
      </main>

      <form
        className="chat__barre"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          demander(question);
        }}
      >
        <input
          className="input"
          placeholder="Votre question…"
          value={question}
          onChange={(evenement) => setQuestion(evenement.target.value)}
          disabled={occupe}
          aria-label="Votre question"
        />
        <button
          type="submit"
          className="chat__envoyer"
          disabled={occupe || !question.trim()}
          aria-label="Envoyer"
        >
          <Send size={19} />
        </button>
      </form>
    </>
  );
}

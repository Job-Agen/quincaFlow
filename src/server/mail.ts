import { badRequest } from '../lib/http';

/**
 * L'envoi de courriel (§57).
 *
 * L'application n'envoie pas elle-même : un serveur qui parle SMTP depuis une
 * fonction sans adresse fixe voit ses messages classés en indésirables avant
 * d'arriver. Elle confie donc le message à un expéditeur — Resend — par une
 * requête HTTP, et c'est lui qui répond de la réputation de l'adresse.
 *
 * Deux variables d'environnement, et rien dans le code :
 *
 *   RESEND_API_KEY  la clé du compte
 *   MAIL_FROM       l'adresse d'expédition, « Ma Quincaillerie <no-reply@… > »
 *
 * Sans elles, la fonctionnalité se tait proprement et dit quoi configurer,
 * plutôt que d'échouer sur un 401 illisible au moment où le gérant appuie.
 */

export interface PieceJointe {
  nom: string;
  /** Le contenu, encodé en base64 : c'est ce que l'API attend. */
  contenu: string;
}

export function mailConfigure(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * Envoie un message, et rend ce que l'expéditeur a répondu.
 *
 * Les erreurs de l'expéditeur sont relayées telles quelles au gérant — « ce
 * domaine n'est pas vérifié », « quota dépassé » : ce sont des phrases qu'il
 * peut agir, là où « échec de l'envoi » ne lui dit rien.
 */
export async function envoyerMail({
  a,
  sujet,
  texte,
  repondreA,
  pieces = [],
}: {
  a: string;
  sujet: string;
  texte: string;
  repondreA?: string | null;
  pieces?: PieceJointe[];
}): Promise<void> {
  if (!mailConfigure()) {
    throw badRequest(
      'L’envoi par e-mail n’est pas encore configuré. Ajoutez RESEND_API_KEY et MAIL_FROM aux variables d’environnement de la boutique.'
    );
  }

  const reponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [a],
      subject: sujet,
      text: texte,
      // La réponse du client doit arriver à la boutique, pas à une adresse
      // d'expédition que personne ne relève.
      ...(repondreA ? { reply_to: repondreA } : {}),
      attachments: pieces.map((piece) => ({ filename: piece.nom, content: piece.contenu })),
    }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '');
    let message = 'L’expéditeur a refusé le message.';
    try {
      const corps = JSON.parse(detail) as { message?: string };
      if (corps.message) message = corps.message;
    } catch {
      // Réponse illisible : le message générique fera l'affaire.
    }
    throw badRequest(message);
  }
}

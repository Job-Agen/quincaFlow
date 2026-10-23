import { PAGE, type Bloc, type PlanFacture } from './facturePdf';

/**
 * Le tracé d'un plan de facture (§57).
 *
 * Volontairement bête : il ne décide de rien, il pose ce que le plan a placé.
 * Toute l'intelligence de mise en page vit dans `facturePdf`, où elle se teste
 * sans produire un seul octet.
 *
 * `pdf-lib` est chargé ici, et ici seulement, par un import dynamique : la
 * bibliothèque pèse un demi-mégaoctet, et personne ne doit la télécharger pour
 * encaisser une vente. Elle n'arrive qu'au moment où le gérant envoie.
 *
 * Isomorphe à dessein : la même fonction sert au téléphone qui prépare un
 * partage WhatsApp et au serveur qui prépare une pièce jointe de courriel.
 */
export async function tracerFacture(plan: PlanFacture): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold);

  const noir = rgb(0, 0, 0);
  const gris = rgb(0.42, 0.45, 0.5);
  const filetClair = rgb(0.78, 0.8, 0.84);

  for (const feuille of plan.pages) {
    const page = pdf.addPage([PAGE.largeur, PAGE.hauteur]);

    for (const bloc of feuille.blocs) {
      if (bloc.type === 'filet') {
        page.drawLine({
          start: { x: bloc.x1, y: bloc.y },
          end: { x: bloc.x2, y: bloc.y },
          thickness: bloc.epaisseur,
          color: bloc.epaisseur >= 1 ? noir : filetClair,
        });
        continue;
      }

      if (bloc.type === 'cadre') {
        page.drawRectangle({
          x: bloc.x,
          y: bloc.y,
          width: bloc.largeur,
          height: bloc.hauteur,
          borderColor: filetClair,
          borderWidth: 0.6,
        });
        continue;
      }

      if (bloc.type === 'image') {
        await dessinerImage(pdf, page, bloc);
        continue;
      }

      const police = bloc.gras ? grasse : normale;
      // L'alignement à droite se calcule ici : seule la police connaît la
      // largeur réelle du texte, que le plan ne peut pas deviner.
      const largeur = police.widthOfTextAtSize(bloc.texte, bloc.taille);
      const x =
        bloc.aligne === 'droite'
          ? bloc.x - largeur
          : bloc.aligne === 'centre'
            ? bloc.x - largeur / 2
            : bloc.x;
      page.drawText(bloc.texte, {
        x,
        y: bloc.y,
        size: bloc.taille,
        font: police,
        color: bloc.gris ? gris : noir,
      });
    }
  }

  return pdf.save();
}

/**
 * Pose le logo, et laisse la facture partir s'il est illisible.
 *
 * Le logo vient d'une `data:` URL choisie par le gérant (§51) : un fichier
 * tronqué ou d'un format que `pdf-lib` ne lit pas ferait échouer l'envoi tout
 * entier. Une facture sans logo part ; une facture qui ne part pas, non.
 */
async function dessinerImage(
  pdf: Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.create>>,
  page: ReturnType<typeof pdf.addPage>,
  bloc: Extract<Bloc, { type: 'image' }>
): Promise<void> {
  try {
    const virgule = bloc.source.indexOf(',');
    if (virgule < 0) return;
    const octets = Uint8Array.from(atob(bloc.source.slice(virgule + 1)), (c) => c.charCodeAt(0));
    const image = bloc.source.startsWith('data:image/jpeg')
      ? await pdf.embedJpg(octets)
      : await pdf.embedPng(octets);

    // La proportion est gardée : un logo étiré est pire qu'un logo absent.
    const echelle = Math.min(bloc.largeur / image.width, bloc.hauteur / image.height);
    page.drawImage(image, {
      x: bloc.x,
      y: bloc.y + (bloc.hauteur - image.height * echelle),
      width: image.width * echelle,
      height: image.height * echelle,
    });
  } catch {
    // Logo illisible : la facture part sans lui.
  }
}

/**
 * Réduction d'une image dans le navigateur.
 *
 * Deux écrans en ont besoin pour des raisons différentes — le justificatif de
 * dépense (§40) et le logo de la boutique (§51) — et pour des réglages
 * différents : un reçu manuscrit se lit en JPEG sur fond blanc, un logo veut
 * garder sa transparence en PNG. Ce qu'ils partagent est le geste : décoder,
 * redessiner plus petit, réencoder.
 *
 * Le dessin passe par un canvas : c'est le seul moyen, dans un navigateur, de
 * réencoder une image à une autre taille. L'objet URL est révoqué dans tous les
 * cas — une photo de 4 Mo retenue par un `blob:` oublié à chaque saisie finirait
 * par faire tomber l'onglet.
 */
export async function shrinkImage(
  file: File,
  {
    maxSide,
    type = 'image/jpeg',
    quality = 0.72,
    background = null,
  }: {
    /** Côté maximal de l'image rendue. Au-delà, on ne gagne rien de lisible. */
    maxSide: number;
    type?: 'image/jpeg' | 'image/png';
    quality?: number;
    /** Fond posé sous l'image, ou `null` pour garder la transparence. */
    background?: string | null;
  }
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image illisible.'));
      element.src = url;
    });

    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne peut pas réduire cette image.');
    if (background) {
      // Sans ce fond, un PNG transparent réencodé en JPEG donnerait un reçu sur
      // fond noir, illisible.
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL(type, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

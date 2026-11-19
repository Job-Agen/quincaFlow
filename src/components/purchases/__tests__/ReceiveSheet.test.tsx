import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReceiveSheet from '../ReceiveSheet';
import type { PurchaseOrder } from '@/types';

/**
 * Réception marchandise par marchandise (§72).
 *
 * Ce que ces tests gardent, c'est la promesse faite au gérant : **rien
 * n'entre en stock qu'il n'ait coché**. Un fournisseur livre rarement tout
 * d'un coup, et une case pré-cochée ferait entrer des sacs qui sont encore
 * au dépôt — le stock mentirait, et la commande se croirait soldée.
 */
const commande = {
  id: 'po_1',
  reference: 'PO-0001',
  status: 'SENT',
  currency: 'FCFA',
  items: [
    {
      id: 'it_ciment',
      product_name: 'Ciment 50 kg',
      unit_label: 'sac',
      quantity_ordered: 100,
      quantity_received: 0,
      unit_cost: 3900,
    },
    {
      id: 'it_fer',
      product_name: 'Fer 8',
      unit_label: 'barre',
      quantity_ordered: 50,
      quantity_received: 0,
      unit_cost: 1000,
    },
  ],
} as unknown as PurchaseOrder;

const afficher = (onConfirm = vi.fn().mockResolvedValue(undefined)) => {
  render(<ReceiveSheet open order={commande} onClose={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
};

const bouton = () =>
  screen.getByRole('button', { name: /Cochez ce qui est arrivé|Enregistrer \d/ }) as HTMLButtonElement;

/** La case d'une marchandise, lue comme une vraie case à cocher. */
const coche = (produit: string) => screen.getByLabelText(`${produit} livré`) as HTMLInputElement;

describe('réception marchandise par marchandise (§72)', () => {
  it('ne valide rien au départ', () => {
    afficher();
    // Aucune case cochée, aucune quantité à l'écran, et le bouton dit quoi
    // faire plutôt que de rester muet.
    expect(coche('Ciment 50 kg').checked).toBe(false);
    expect(coche('Fer 8').checked).toBe(false);
    expect(screen.queryByLabelText(/Quantité/)).toBeNull();
    expect(bouton().disabled).toBe(true);
    expect(bouton().textContent).toMatch(/cochez/i);
  });

  it('ouvre la quantité quand la marchandise est validée, pré-remplie au reste', () => {
    afficher();
    fireEvent.click(coche('Ciment 50 kg'));
    const quantite = screen.getByLabelText('Quantité (sac)') as HTMLInputElement;
    expect(quantite.value).toBe('100');
    // L'autre marchandise n'a pas bougé : la validation est bien une par une.
    expect(screen.queryByLabelText('Quantité (barre)')).toBeNull();
  });

  it('compte ce qui est validé, et le dit sur le bouton', () => {
    afficher();
    fireEvent.click(coche('Ciment 50 kg'));
    expect(screen.getByText(/sur 2 validée/)).toBeDefined();
    expect(bouton().textContent).toMatch(/Enregistrer 1 marchandise$/);
    fireEvent.click(coche('Fer 8'));
    expect(bouton().textContent).toMatch(/Enregistrer 2 marchandises/);
  });

  it('n’envoie que les marchandises cochées', async () => {
    const onConfirm = afficher();
    fireEvent.click(coche('Ciment 50 kg'));
    fireEvent.change(screen.getByLabelText('Quantité (sac)'), { target: { value: '60' } });
    fireEvent.click(bouton());
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalled());

    const envoye = onConfirm.mock.calls[0]![0] as { lines: { itemId: string; quantity: number }[] };
    // Le fer n'est pas arrivé : il ne doit pas partir, même à zéro. Une ligne
    // à zéro ferait un reçu qui prétend l'avoir constaté.
    expect(envoye.lines).toHaveLength(1);
    expect(envoye.lines[0]).toMatchObject({ itemId: 'it_ciment', quantity: 60 });
  });

  it('coche et décoche tout d’un geste', () => {
    afficher();
    fireEvent.click(screen.getByRole('button', { name: 'Tout cocher' }));
    expect(coche('Ciment 50 kg').checked).toBe(true);
    expect(coche('Fer 8').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tout décocher' }));
    expect(coche('Ciment 50 kg').checked).toBe(false);
  });

  it('nomme la marchandise dont la quantité manque, et n’envoie rien', async () => {
    const onConfirm = afficher();
    fireEvent.click(coche('Fer 8'));
    fireEvent.change(screen.getByLabelText('Quantité (barre)'), { target: { value: '0' } });
    fireEvent.click(bouton());

    // « Indiquez au moins une quantité » ne dit pas laquelle : sur une
    // commande de dix lignes, le gérant chercherait.
    expect(await screen.findByText(/Quelle quantité de Fer 8/)).toBeDefined();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ne propose que ce qui reste à livrer', () => {
    const entamee = {
      ...commande,
      items: [
        { ...commande.items[0], quantity_received: 100 },
        { ...commande.items[1], quantity_received: 20 },
      ],
    } as unknown as PurchaseOrder;
    render(<ReceiveSheet open order={entamee} onClose={() => {}} onConfirm={vi.fn()} />);
    // Le ciment est soldé : le reproposer inviterait à le recevoir deux fois.
    expect(screen.queryByLabelText('Ciment 50 kg livré')).toBeNull();
    fireEvent.click(coche('Fer 8'));
    expect((screen.getByLabelText('Quantité (barre)') as HTMLInputElement).value).toBe('30');
  });
});

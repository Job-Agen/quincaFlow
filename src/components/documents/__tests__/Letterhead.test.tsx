import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Letterhead from '../Letterhead';
import type { BusinessRow } from '@/types';

/**
 * L'en-tête des documents qui sortent de la boutique (§51).
 *
 * Ce que ces tests gardent est ce qui engage le commerce : son identité sur la
 * facture remise au client comme sur le bon envoyé au fournisseur. Et la règle
 * qui évite le ridicule — un champ vide ne doit pas imprimer son étiquette : un
 * « Tél : » suivi de rien sur une facture dit au client que le commerçant n'a
 * pas de téléphone.
 */

const BOUTIQUE: BusinessRow = {
  id: 'biz_1',
  name: 'Quincaillerie Le Bâtisseur',
  phone: '+228 90 12 34 56',
  address: 'Avenue de l’Indépendance, Lomé',
  tagline: 'Tout pour construire',
  tax_id: '1000123456789',
  logo: null,
  currency: 'FCFA',
};

describe('en-tête de document', () => {
  it('porte l’identité complète de la boutique', () => {
    render(<Letterhead business={BOUTIQUE} />);
    expect(screen.getByText(BOUTIQUE.name)).toBeDefined();
    expect(screen.getByText('Tout pour construire')).toBeDefined();
    expect(screen.getByText('Avenue de l’Indépendance, Lomé')).toBeDefined();
    expect(screen.getByText('Tél : +228 90 12 34 56')).toBeDefined();
  });

  it('imprime le numéro fiscal, sans lequel la facture est refusée', () => {
    render(<Letterhead business={BOUTIQUE} />);
    expect(screen.getByText('IFU / NIF : 1000123456789')).toBeDefined();
  });

  it('n’imprime pas l’étiquette d’un champ vide', () => {
    const { container } = render(
      <Letterhead
        business={{ ...BOUTIQUE, phone: null, address: null, tagline: null, tax_id: null }}
      />
    );
    const texte = container.textContent || '';
    expect(texte).toContain('Quincaillerie Le Bâtisseur');
    expect(texte).not.toContain('Tél :');
    expect(texte).not.toContain('IFU / NIF');
  });

  it('affiche le logo de la boutique quand elle en a un', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    render(<Letterhead business={{ ...BOUTIQUE, logo }} />);
    const image = screen.getByRole('img', { name: /Logo de Quincaillerie Le Bâtisseur/ });
    expect(image.getAttribute('src')).toBe(logo);
  });

  it('retombe sur le pictogramme en l’absence de logo', () => {
    const { container } = render(<Letterhead business={BOUTIQUE} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('ne casse pas tant que la boutique n’est pas chargée', () => {
    // L'écran monte avant la réponse du serveur : un en-tête qui jetterait ici
    // ferait écran blanc au lieu d'une facture qui s'affiche en deux temps.
    const { container } = render(<Letterhead business={null} />);
    expect(container.textContent).toBe('');
  });
});

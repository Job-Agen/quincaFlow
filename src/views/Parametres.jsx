'use client';

import { COLORS, FONTS } from '../constants/theme';

export default function Parametres() {
  return (
    <div>
      <h1 style={{ fontFamily: FONTS.heading, color: COLORS.text, fontSize: '24px' }}>
        Paramètres
      </h1>
      <p style={{ color: COLORS.muted, fontFamily: FONTS.body }}>Module en construction.</p>
    </div>
  );
}

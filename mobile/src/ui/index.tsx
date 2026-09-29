import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { CIBLE_TACTILE, couleurs, rayons } from '../lib/theme';

/**
 * Briques d'interface du mobile.
 *
 * Elles portent les mêmes noms que celles du web (`Card`, `Notice`, `Empty`…)
 * pour qu'un écran se relise d'une plateforme à l'autre, mais ce sont des
 * composants natifs : React Native n'a ni `div` ni feuille de style en cascade.
 */

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function Button({
  children,
  onPress,
  disabled,
  variant = 'primary',
  busy,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success' | 'ghost';
  busy?: boolean;
}) {
  const inactif = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactif) }}
      onPress={onPress}
      disabled={inactif}
      style={({ pressed }) => [
        styles.bouton,
        variant === 'success' && { backgroundColor: couleurs.green },
        variant === 'ghost' && styles.boutonGhost,
        inactif && styles.boutonInactif,
        // Un retour tactile immédiat : sur un téléphone d'entrée de gamme, la
        // réponse du serveur peut tarder, et le vendeur appuierait deux fois.
        pressed && !inactif && { opacity: 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.boutonTexte, variant === 'ghost' && { color: couleurs.blue }]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string }>(
  function Field({ label, hint, style, ...props }, ref) {
    return (
      <View style={styles.champ}>
        <Text style={styles.champLabel}>{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={couleurs.faint}
          style={[styles.saisie, style]}
          {...props}
        />
        {hint ? <Text style={styles.champHint}>{hint}</Text> : null}
      </View>
    );
  }
);

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error' | 'warn';
}) {
  const fonds = {
    info: couleurs.blueSoft,
    error: couleurs.redSoft,
    warn: couleurs.amberSoft,
  } as const;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.notice, { backgroundColor: fonds[tone] }]}
    >
      <Text style={styles.noticeTexte}>{children}</Text>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.vide}>
      <Text style={styles.videTitre}>{title}</Text>
      {hint ? <Text style={styles.videHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chargement({ label = 'Chargement' }: { label?: string }) {
  return (
    <View style={styles.chargement} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={couleurs.blue} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.line,
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  bouton: {
    minHeight: CIBLE_TACTILE,
    borderRadius: rayons.md,
    backgroundColor: couleurs.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  boutonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: couleurs.line },
  boutonInactif: { opacity: 0.45 },
  boutonTexte: { color: '#fff', fontWeight: '800', fontSize: 15 },
  champ: { gap: 6 },
  champLabel: { fontSize: 13, fontWeight: '700', color: couleurs.ink2 },
  champHint: { fontSize: 12, color: couleurs.muted },
  saisie: {
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.md,
    paddingHorizontal: 12,
    // 16 points : en dessous, le clavier d'iOS zoome sur le champ au focus (§32).
    fontSize: 16,
    color: couleurs.ink,
    backgroundColor: couleurs.surface,
  },
  notice: { borderRadius: rayons.md, padding: 12 },
  noticeTexte: { fontSize: 13, lineHeight: 19, color: couleurs.ink2 },
  vide: { paddingVertical: 32, alignItems: 'center', gap: 6 },
  videTitre: { fontSize: 15, fontWeight: '700', color: couleurs.ink2 },
  videHint: { fontSize: 13, color: couleurs.muted, textAlign: 'center' },
  chargement: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});

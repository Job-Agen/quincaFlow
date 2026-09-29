import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CIBLE_TACTILE, couleurs } from '../../src/lib/theme';

/**
 * Les six destinations du §6, dans son ordre.
 *
 * ```
 * Accueil | Vendre | Produits | Achats | Historique | Plus
 * ```
 *
 * Elles restent à portée de pouce en permanence : au comptoir, un client
 * attend, et descendre dans un menu pour encaisser coûte une vente. Le reste —
 * clients, fournisseurs, rapports, paramètres — vit derrière « Plus ».
 *
 * Six onglets sur un écran de 360 px imposent des libellés courts :
 * « Historique » est le plus long, et c'est lui qui fixe la taille du texte.
 */
export default function Onglets() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: couleurs.blue,
        tabBarInactiveTintColor: '#66717e',
        tabBarStyle: { minHeight: CIBLE_TACTILE + 14, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 9.5, fontWeight: '700' },
        sceneStyle: { backgroundColor: couleurs.bg },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Accueil',
          headerTitle: 'MaQuincaillerie',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sale"
        options={{
          title: 'Vendre',
          headerTitle: 'Nouvelle vente',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produits',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Achats',
          headerTitle: 'Commandes fournisseurs',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Plus',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

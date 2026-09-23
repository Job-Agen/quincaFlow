import LocalApp from '@/local/LocalApp';
import './local.css';
export const metadata = {
  title: 'MaQuincaillerie — Boutique autonome',
  manifest: '/local.webmanifest',
};
export default function LocalPage() {
  return <LocalApp />;
}

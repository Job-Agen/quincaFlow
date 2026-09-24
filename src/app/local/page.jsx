import LocalApp from '@/local/LocalApp';
import './local.css';
export const metadata = {
  title: 'MaQuincaillerie — Ma boutique',
  manifest: '/local.webmanifest',
};
export default function LocalPage() {
  return <LocalApp />;
}

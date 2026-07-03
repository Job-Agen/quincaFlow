'use client';

import useBreakpoint from '../../hooks/useBreakpoint';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { isMobile, isTablet, isDesktop } = useBreakpoint();

  // Mobile: no sidebar, bottom nav
  // Tablet: compact sidebar (60px), no bottom nav
  // Desktop: full sidebar (230px), no bottom nav
  const showSidebar = isTablet || isDesktop;
  const showBottomNav = isMobile;
  const sidebarCompact = isTablet;
  const sidebarWidth = isDesktop ? 230 : isTablet ? 60 : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
      }}
    >
      {showSidebar && <Sidebar currentPath={pathname} compact={sidebarCompact} />}

      <main
        style={{
          marginLeft: sidebarWidth,
          paddingBottom: showBottomNav ? '80px' : 0,
          minHeight: '100vh',
          width: `calc(100% - ${sidebarWidth}px)`,
        }}
      >
        {children}
      </main>

      {showBottomNav && <BottomNav currentPath={pathname} />}
    </div>
  );
}

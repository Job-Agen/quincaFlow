'use client';

import { useState, useEffect } from 'react';

const MOBILE_MAX = 767;
const TABLET_MAX = 1024;

/**
 * Centralized responsive breakpoint hook.
 * Returns { isMobile, isTablet, isDesktop } based on window width.
 *
 * Breakpoints:
 *   Mobile:  width <= 767px
 *   Tablet:  768px <= width <= 1024px
 *   Desktop: width >= 1025px
 */
export default function useBreakpoint() {
  const [bp, setBp] = useState(() => {
    if (typeof window === 'undefined') return { isMobile: false, isTablet: false, isDesktop: true };
    const w = window.innerWidth;
    return {
      isMobile: w <= MOBILE_MAX,
      isTablet: w > MOBILE_MAX && w <= TABLET_MAX,
      isDesktop: w > TABLET_MAX,
    };
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setBp({
        isMobile: w <= MOBILE_MAX,
        isTablet: w > MOBILE_MAX && w <= TABLET_MAX,
        isDesktop: w > TABLET_MAX,
      });
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return bp;
}

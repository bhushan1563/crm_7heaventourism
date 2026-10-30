import { useEffect, useState } from 'react';

/** Tracks a CSS media query (e.g. '(max-width: 1023.98px)') and re-renders when it starts / stops matching. */
export const useMediaQuery = (query) => {
  const getMatch = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

/** Below this width the sidebar becomes an off-canvas drawer (phones and small tablets). */
export const MOBILE_NAV_QUERY = '(max-width: 1023.98px)';

export default useMediaQuery;

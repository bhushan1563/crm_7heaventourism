import { useEffect, useRef, useState } from 'react';

/**
 * Scale factor that makes content designed for `designWidth` px fit the width of the element the returned ref is
 * attached to. Attach the ref to a wrapper that is NOT itself zoomed/scaled.
 */
export const useFitScale = (designWidth, { min = 0.3, max = 1 } = {}) => {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      const width = element.clientWidth;
      if (width) setScale(Math.min(max, Math.max(min, width / designWidth)));
    };
    update();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [designWidth, min, max]);

  return [ref, scale];
};

export default useFitScale;

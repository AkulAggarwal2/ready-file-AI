import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The main heading of a screen. It takes focus when the screen appears, so
 * screen reader users hear where they are.
 */
export function StepHeading({ id, children }: { id?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <h1 id={id} ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}

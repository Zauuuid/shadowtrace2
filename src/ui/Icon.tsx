/** The eight icons of the interface, one style: 24 px grid, 2 px stroke, round caps. Nothing decorative. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  arrow: 'M5 12h14M13 6l6 6l-6 6',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17M12 11v5.5M12 7.6v.4',
  locate: 'M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3',
  layers: 'M12 3.5l8.5 4.5L12 12.5L3.5 8zM3.5 12.2L12 16.7l8.5-4.5M3.5 16.2L12 20.7l8.5-4.5',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

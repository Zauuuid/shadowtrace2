/** ShadowTrace mark: a round Moon with one long diagonal shadow stripe (the trace). Same drawing as public/favicon.svg. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs>
        <clipPath id="st-disc"><circle cx="16" cy="16" r="13" /></clipPath>
      </defs>
      <circle cx="16" cy="16" r="13" fill="#D9DEE4" />
      <path d="M-2 25L25 -2L31 4L4 31Z" fill="#8FD3E6" clipPath="url(#st-disc)" />
    </svg>
  );
}

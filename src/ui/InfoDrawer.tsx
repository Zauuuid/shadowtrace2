/** The sources, and nothing else (MASTER-PROMPT §9). On narrow phones it also holds the time-zone toggle. */
import { useT, type Key } from '../i18n';
import { Sheet } from './Sheet';
import { TzToggle } from './Header';

const SOURCES: readonly [Key, string][] = [
  ['src.horizons', 'https://ssd.jpl.nasa.gov/horizons/'],
  ['src.lola', 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm'],
  ['src.trek', 'https://trek.nasa.gov/moon/'],
  ['src.iau', 'https://planetarynames.wr.usgs.gov/'],
  ['src.svs', 'https://svs.gsfc.nasa.gov/4720/'],
];

export function InfoDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Sheet title={t('src.title')} label={t('src.title')} onClose={onClose}>
      <div className="drawer-tz"><TzToggle /></div>
      <ul className="sources">
        {SOURCES.map(([k, url]) => <li key={k}><a href={url} target="_blank" rel="noreferrer">{t(k)}</a></li>)}
      </ul>
    </Sheet>
  );
}

export type IconName = 'pin' | 'search' | 'landmark' | 'town' | 'park' | 'grid' | 'close' | 'arrow' | 'layers' | 'plus' | 'minus' | 'compass' | 'sun' | 'moon' | 'chevron';
const paths: Record<IconName, string> = {
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  landmark: 'm3 9 9-6 9 6H3Zm2 3v6m5-6v6m4-6v6m5-6v6M3 21h18',
  town: 'M3 21V9l6-5 6 5v12M9 4V2m6 19V11l6-4v14M7 13h4m-4 4h4m7-4h1m-1 4h1',
  park: 'm12 2-5 7h3l-5 7h6v6h2v-6h6l-5-7h3L12 2Z',
  grid: 'M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h6v6h-6v-6Z',
  close: 'm6 6 12 12M6 18 18 6', arrow: 'M5 12h14m-6-6 6 6-6 6',
  layers: 'm12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  compass: 'm16 8-3 5-5 3 3-5 5-3ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z', chevron: 'm9 5 7 7-7 7',
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

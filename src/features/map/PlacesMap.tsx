import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Place } from '../attractions/api';
import { Icon } from '../../shared/lib/Icon';
export const categoryColors: Record<string, string> = {
  'landmark-replica': '#8998f4', 'themed-town': '#ba86e9', 'theme-park': '#8cbf83', other: '#dfab72',
};
function MapActions({ selected }: { selected: Place | null }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.flyTo([selected.latitude, selected.longitude], 10, { duration: 1.2 });
  }, [selected, map]);
  return <div className="map-controls">
    <button title="Показать Китай" aria-label="Показать Китай" onClick={() => map.flyTo([31, 110], 5)}><Icon name="compass" /></button>
    <div><button aria-label="Приблизить" onClick={() => map.zoomIn()}><Icon name="plus" /></button><button aria-label="Отдалить" onClick={() => map.zoomOut()}><Icon name="minus" /></button></div>
  </div>;
}
export function PlacesMap({ places, selected, onSelect, light }: { places: Place[]; selected: Place | null; onSelect: (p: Place) => void; light: boolean }) {
  const style = light ? 'light' : 'dark';
  return <MapContainer center={[31, 110]} zoom={5} minZoom={3} className="map" zoomControl={false} scrollWheelZoom>
    <TileLayer key={style} url={import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
      attribution={import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />
    {places.map(place => <CircleMarker key={place.id} center={[place.latitude, place.longitude]}
      radius={selected?.id === place.id ? 14 : 10}
      pathOptions={{ color: selected?.id === place.id ? '#fff' : categoryColors[place.category] || categoryColors.other,
        weight: selected?.id === place.id ? 3 : 2, fillColor: categoryColors[place.category] || categoryColors.other, fillOpacity: 0.95 }}
      eventHandlers={{ click: () => onSelect(place) }} />)}
    <MapActions selected={selected} />
  </MapContainer>;
}

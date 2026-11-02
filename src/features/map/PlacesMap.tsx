import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Attraction } from '../attractions/api';
export function PlacesMap({ places }: { places: Attraction[] }) {
  return <MapContainer center={[34, 105]} zoom={4} minZoom={2} className="map" scrollWheelZoom>
    <TileLayer
      url={import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
      attribution={import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
    />
    {places.map(place => <CircleMarker key={place.id} center={[place.latitude, place.longitude]}
      radius={7} pathOptions={{ color: '#bc452d', fillColor: '#bc452d', fillOpacity: 0.85 }}>
      <Popup><strong>{place.name}</strong>{place.original_name && <p>Оригинал: {place.original_name}</p>}</Popup>
    </CircleMarker>)}
  </MapContainer>;
}

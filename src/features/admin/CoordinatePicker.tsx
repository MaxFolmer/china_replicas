import { useEffect } from 'react';
import { divIcon, type Marker as LeafletMarker } from 'leaflet';
import { AttributionControl, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

type Coordinates = { latitude: number | null; longitude: number | null };
const markerIcon=divIcon({className:'coordinate-marker',html:'<span></span>',iconSize:[28,28],iconAnchor:[14,14]});
const rounded=(value:number)=>Number(value.toFixed(6));

function MapEvents({onChange}:{onChange:(value:Coordinates)=>void}) {
  useMapEvents({click:event=>onChange({latitude:rounded(event.latlng.lat),longitude:rounded(event.latlng.lng)})});
  return null;
}
function MapPosition({latitude,longitude}:{latitude:number|null;longitude:number|null}) {
  const map=useMap();
  useEffect(()=>{if(latitude!==null&&longitude!==null)map.panTo([latitude,longitude]);},[latitude,longitude,map]);
  return null;
}
export function CoordinatePicker({latitude,longitude,onChange}:{latitude:number|null;longitude:number|null;onChange:(value:Coordinates)=>void}) {
  const hasPosition=latitude!==null&&longitude!==null;
  const center:[number,number]=hasPosition?[latitude,longitude]:[35,104];
  return <div className="coordinate-picker">
    <MapContainer center={center} zoom={hasPosition?13:4} minZoom={3} maxZoom={19} zoomControl scrollWheelZoom className="coordinate-map" attributionControl={false}>
      <AttributionControl prefix='<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>' />
      <TileLayer url={import.meta.env.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} attribution={import.meta.env.VITE_MAP_ATTRIBUTION||'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}/>
      <MapEvents onChange={onChange}/><MapPosition latitude={latitude} longitude={longitude}/>
      {hasPosition&&<Marker position={[latitude,longitude]} icon={markerIcon} draggable eventHandlers={{dragend:event=>{const point=(event.target as LeafletMarker).getLatLng();onChange({latitude:rounded(point.lat),longitude:rounded(point.lng)});}}}/>} 
    </MapContainer>
    <div className="coordinate-map-help"><span>{hasPosition?`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`:'Нажмите на карту, чтобы поставить маркер'}</span>{hasPosition&&<button type="button" onClick={()=>onChange({latitude:null,longitude:null})}>Очистить</button>}</div>
  </div>;
}

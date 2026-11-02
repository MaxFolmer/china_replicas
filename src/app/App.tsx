import { useEffect, useState } from 'react';
import { listAttractions, type Attraction } from '../features/attractions/api';
import { PlacesMap } from '../features/map/PlacesMap';
import { configurationError, supabase } from '../shared/lib/supabase';
export function App() {
  const [places, setPlaces] = useState<Attraction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  useEffect(() => {
    const controller = new AbortController();
    listAttractions(controller.signal).then(data => {
      if (!controller.signal.aborted) setPlaces(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Не удалось загрузить каталог. Проверьте подключение и миграции базы.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <main className="layout">
    <aside className="sidebar">
      <a className="brand" href="/">CR<span>CHINA REPLICAS</span></a>
      <p className="eyebrow">АТЛАС АРХИТЕКТУРНЫХ КОПИЙ</p>
      <h1>Знакомые места.<br /><em>Другой Китай.</em></h1>
      <p className="intro">Копии мировых достопримечательностей, тематические города и архитектурные эксперименты на одной карте.</p>
      <div className="catalog-heading"><h2>Каталог</h2><span>{places.length}</span></div>
      <div aria-live="polite" className="status">
        {configurationError || error ? <p role="alert">{configurationError || error}</p>
          : loading ? <p>Загружаем места…</p>
          : !supabase ? <><strong>Готовимся к путешествию</strong><p>База ещё не подключена. Здесь появятся проверенные места из вашего архива.</p></>
          : places.length === 0 ? <><strong>Первое место ещё впереди</strong><p>Каталог подключён. Опубликованные объекты появятся на карте после проверки.</p></>
          : <ul>{places.map(place => <li key={place.id}><strong>{place.name}</strong><small>{place.original_name}</small></li>)}</ul>}
      </div>
      <footer>Исследуем копии. Сохраняем истории.<br />Координаты каталога · WGS84</footer>
    </aside>
    <section className="map-panel" aria-label="Карта Китая"><PlacesMap places={places} /><span className="map-label">КИТАЙ · АРХИТЕКТУРА БЕЗ ГРАНИЦ</span></section>
  </main>;
}

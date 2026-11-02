import { useEffect, useMemo, useState } from 'react';
import { listAttractions, type Place } from '../features/attractions/api';
import { demoPlaces } from '../features/attractions/demo';
import { PlacesMap, categoryColors } from '../features/map/PlacesMap';
import { configurationError } from '../shared/lib/supabase';
import { Icon, type IconName } from '../shared/lib/Icon';
const categories: { slug: string; name: string; icon: IconName }[] = [
  { slug: 'all', name: 'Все места', icon: 'grid' },
  { slug: 'landmark-replica', name: 'Копии', icon: 'landmark' },
  { slug: 'themed-town', name: 'Города', icon: 'town' },
  { slug: 'theme-park', name: 'Парки', icon: 'park' },
];
const placeLabel = (count: number) => ({ one: 'место', few: 'места', many: 'мест', other: 'мест', zero: 'мест', two: 'места' }[new Intl.PluralRules('ru').select(count)]);
export function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(new URLSearchParams(location.search).get('preview') === '1');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Place | null>(null);
  const [light, setLight] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    listAttractions(controller.signal).then(data => { if (!controller.signal.aborted) setPlaces(data); })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить места. Попробуйте позже.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const filtered = useMemo(() => (demo ? demoPlaces : places).filter(p =>
    (category === 'all' || p.category === category) &&
    `${p.name} ${p.original || ''} ${p.city}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())
  ), [demo, places, category, search]);
  const groups = filtered.reduce<Record<string, Place[]>>((result, place) => { (result[place.city] ||= []).push(place); return result; }, {});
  function changeCategory(slug: string) { setCategory(slug); setSelected(null); }
  function toggleDemo() { setDemo(!demo); setSelected(null); setSearch(''); setCategory('all'); }
  return <main className={`atlas ${light ? 'light' : ''} ${selected?'place-selected':''}`}>
    <section className="map-canvas" aria-label="Карта Китая"><PlacesMap places={filtered} selected={selected} onSelect={setSelected} light={light} /></section>
    <header className="toolbar glass" aria-label="Поиск и фильтры">
      <button className="menu-button" title={listOpen?'Скрыть список':'Показать список'} aria-label={listOpen?'Скрыть список мест':'Показать список мест'} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}><Icon name="layers" /></button>
      <nav aria-label="Тип места">{categories.map(c => <button key={c.slug} title={c.name} aria-pressed={category === c.slug} onClick={() => changeCategory(c.slug)} className={category === c.slug ? 'active' : ''}><Icon name={c.icon} /><span>{c.name}</span></button>)}</nav>
      <span className="toolbar-divider" />
      <label className="search"><Icon name="search" size={17} /><input aria-label="Поиск мест" placeholder="Найти место…" value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }} />{search && <button aria-label="Очистить поиск" onClick={() => setSearch('')}><Icon name="close" size={14} /></button>}</label>
      <button className="theme-button" title={light ? 'Тёмная карта' : 'Светлая карта'} aria-label={light ? 'Тёмная карта' : 'Светлая карта'} onClick={() => setLight(!light)}><Icon name={light ? 'moon' : 'sun'} /></button>
    </header>
    {listOpen && <aside className="places-panel glass" aria-label="Каталог мест">
      <div className="panel-heading"><div><span className="wordmark">CHINA REPLICAS <span>中国</span></span><h1>Все места</h1></div><span className="place-count">{filtered.length} {placeLabel(filtered.length)}</span></div>
      <div className="catalog-caption"><span className={`status-dot ${demo ? 'demo' : ''}`} /><span>{demo ? 'Демо-подборка' : 'Архитектурные копии Китая'}</span><button onClick={toggleDemo}>{demo ? 'К каталогу' : 'Пример'}<Icon name="chevron" size={13} /></button></div>
      <div className="places-scroll" aria-live="polite">
        {!demo && (configurationError || error) && <p role="alert" className="notice">{configurationError || error}</p>}
        {!demo && loading ? <p className="empty-text">Загружаем места…</p> : filtered.length === 0 ? <div className="empty-state"><Icon name="pin" size={30} /><h2>{search || category !== 'all' ? 'Ничего не найдено' : 'Карта начинается с первого места'}</h2><p>{search || category !== 'all' ? 'Попробуйте другой запрос или категорию.' : 'Здесь появятся объекты из вашего архива после проверки.'}</p>{!demo && !search && <button className="outline-button" onClick={toggleDemo}>Посмотреть пример <Icon name="arrow" size={16} /></button>}</div>
          : Object.entries(groups).map(([city, group]) => <section className="city-group" key={city}><h2><Icon name="pin" size={15} />{city}<span>{group!.length}</span></h2>{group!.map(place => <button key={place.id} className={`place-card ${selected?.id === place.id ? 'selected' : ''}`} onClick={() => setSelected(place)} aria-pressed={selected?.id === place.id}>
            <div className="card-copy"><span className="card-category"><i style={{ background: categoryColors[place.category] || categoryColors.other }} />{categories.find(c => c.slug === place.category)?.name || 'Архитектура'}</span><h3>{place.name}</h3><p>{place.description || place.original || 'Открыть место'}</p></div>
            {place.image ? <img src={place.image} alt={place.name} loading="lazy" /> : <div className="photo-placeholder"><Icon name="landmark" size={30} /></div>}
          </button>)}</section>)}
      </div>
      <div className="catalog-footer"><span>{demo ? 'Примеры · актуальность не проверена' : 'Исследуем архитектуру Китая'}</span><a href="/admin" className="editor-entry">Редакторам ↗</a></div>
    </aside>}
    <aside className={`details-panel glass ${selected ? 'has-selection' : ''}`} aria-label="Информация о месте">
      {selected ? <>
        <div className="detail-top"><span className="eyebrow">{selected.demo ? 'ПРИМЕР МЕСТА' : 'МЕСТО НА КАРТЕ'}</span><button aria-label="Закрыть карточку" onClick={() => setSelected(null)}><Icon name="close" size={18} /></button></div>
        <div className="detail-scroll">
          {selected.image && <img className="detail-photo" src={selected.image} alt={selected.name} />}
          <div className="detail-content"><span className="detail-city"><Icon name="pin" size={14} />{selected.city}</span><h2>{selected.name}</h2><p className="detail-description">{selected.description || 'Описание пока не добавлено.'}</p>
          {selected.original && <div className="original-block"><span>ВДОХНОВЛЕНО</span><strong>{selected.original}</strong></div>}
          <div className="coordinates"><span>Координаты · WGS84</span><code>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</code></div>
          {selected.demo && <p className="demo-note">Демонстрационная карточка. Существование и доступность объекта требуют отдельной проверки.</p>}
          {selected.source && <a className="source-link" href={selected.source} target="_blank" rel="noreferrer">Источник информации <Icon name="arrow" size={16} /></a>}
          {selected.imageSource && <a className="photo-credit" href={selected.imageSource} target="_blank" rel="noreferrer">{selected.imageCredit || 'Фото и условия использования · Wikimedia Commons'}</a>}
          </div>
        </div>
      </> : <div className="detail-welcome"><div className="welcome-icon"><Icon name="compass" size={24} /></div><h2>История<br />каждого места</h2><p>Выберите место на карте или в списке, чтобы увидеть фотографии, описание и архитектурный оригинал.</p><div className="welcome-divider" /><span className="eyebrow">НА КАРТЕ</span><ul><li><i style={{ background: categoryColors['landmark-replica'] }} />Копии достопримечательностей</li><li><i style={{ background: categoryColors['themed-town'] }} />Тематические города</li><li><i style={{ background: categoryColors['theme-park'] }} />Парки миниатюр</li></ul><span className="welcome-bottom">Атлас архитектурных копий Китая</span></div>}
    </aside>
    <div className="map-signature"><span>中国</span><div>CHINA REPLICAS<small>Атлас архитектурных копий</small></div></div>
  </main>;
}

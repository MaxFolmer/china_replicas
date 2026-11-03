import { useEffect, useMemo, useState } from 'react';
import { listAttractions, type Place, type PlacePhoto } from '../features/attractions/api';
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
const routeSlug = () => {
  const match = location.pathname.match(/^\/places\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
};
const placePath = (place: Place | null, preview = false) => place
  ? `/places/${encodeURIComponent(place.slug)}${place.demo ? '?preview=1' : ''}`
  : preview ? '/?preview=1' : '/';
function PhotoGallery({place}:{place:Place}) {
  const fallback:PlacePhoto[] = place.image?[{url:place.image,type:'replica',credit:place.imageCredit,source:place.imageSource}]:[];
  const photos=place.images?.length?place.images:fallback;
  const [index,setIndex]=useState(0);
  if(!photos.length)return null;
  const photo=photos[index];
  const move=(step:number)=>setIndex(current=>(current+step+photos.length)%photos.length);
  return <div className="detail-gallery">
    <img className="detail-photo" src={photo.url} alt={`${place.name} — фото ${index+1}`} />
    {photos.length>1&&<><button className="gallery-arrow previous" aria-label="Предыдущее фото" onClick={()=>move(-1)}><Icon name="chevron" size={21}/></button><button className="gallery-arrow next" aria-label="Следующее фото" onClick={()=>move(1)}><Icon name="chevron" size={21}/></button><span className="gallery-count" aria-live="polite">{index+1} / {photos.length}</span></>}
    {(photo.credit||photo.source)&&(photo.source?<a className="gallery-credit" href={photo.source} target="_blank" rel="noreferrer">{photo.credit||'Источник фотографии'}</a>:<span className="gallery-credit">{photo.credit}</span>)}
  </div>;
}
export function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(new URLSearchParams(location.search).get('preview') === '1');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Place | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
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
  const allPlaces = demo ? demoPlaces : places;
  useEffect(() => {
    const syncRoute = () => {
      const preview = new URLSearchParams(location.search).get('preview') === '1';
      const slug = routeSlug();
      const match = slug ? (preview ? demoPlaces : places).find(place => place.slug === slug) || null : null;
      setDemo(preview);
      setSelected(match);
      setNotFound(Boolean(slug && !match && (preview || !loading)));
      if (slug && matchMedia('(max-width: 700px)').matches) setListOpen(false);
    };
    syncRoute();
    addEventListener('popstate', syncRoute);
    return () => removeEventListener('popstate', syncRoute);
  }, [places, loading]);
  useEffect(() => {
    const title = selected ? `${selected.name} — China Replicas` : 'China Replicas — атлас архитектурных копий Китая';
    const description = selected
      ? (selected.description || `${selected.name}, ${selected.city} — место в атласе архитектурных копий Китая.`).slice(0, 160)
      : 'Интерактивный атлас архитектурных копий, тематических городов и парков Китая.';
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.append(meta);
    }
    meta.content = description;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = `${location.origin}${selected ? `/places/${encodeURIComponent(selected.slug)}` : '/'}`;
  }, [selected]);
  const groups = filtered.reduce<Record<string, Place[]>>((result, place) => { (result[place.city] ||= []).push(place); return result; }, {});
  const related = selected ? allPlaces.filter(place => place.id !== selected.id && (place.city === selected.city || place.category === selected.category)).slice(0, 3) : [];
  const selectedIndex = selected ? allPlaces.findIndex(place => place.id === selected.id) : -1;
  const nextPlace = selectedIndex >= 0 && allPlaces.length > 1 ? allPlaces[(selectedIndex + 1) % allPlaces.length] : null;
  function selectPlace(place: Place | null, replace = false) {
    setSelected(place);
    setNotFound(false);
    setShareStatus('');
    if (place && matchMedia('(max-width: 700px)').matches) setListOpen(false);
    history[replace ? 'replaceState' : 'pushState']({}, '', placePath(place, demo));
  }
  async function sharePlace() {
    if (!selected) return;
    const url = `${location.origin}/places/${encodeURIComponent(selected.slug)}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement('textarea');
        input.value = url; input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.append(input); input.select();
        if (!document.execCommand('copy')) throw new Error('copy_failed');
        input.remove();
      }
      setShareStatus('Ссылка скопирована');
    } catch {
      setShareStatus('Не удалось скопировать ссылку');
    }
    window.setTimeout(() => setShareStatus(''), 2400);
  }
  function changeCategory(slug: string) { setCategory(slug); selectPlace(null); }
  function toggleDemo() {
    const nextDemo = !demo;
    setDemo(nextDemo); setSelected(null); setSearch(''); setCategory('all');
    history.pushState({}, '', nextDemo ? '/?preview=1' : '/');
  }
  return <main className={`atlas ${light ? 'light' : ''} ${selected||notFound?'place-selected':''}`}>
    <section className="map-canvas" aria-label="Карта Китая"><PlacesMap places={filtered} selected={selected} onSelect={selectPlace} light={light} /></section>
    <header className="toolbar glass" aria-label="Поиск и фильтры">
      <button className="menu-button" title={listOpen?'Скрыть список':'Показать список'} aria-label={listOpen?'Скрыть список мест':'Показать список мест'} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}><Icon name="layers" /></button>
      <nav aria-label="Тип места">{categories.map(c => <button key={c.slug} title={c.name} aria-pressed={category === c.slug} onClick={() => changeCategory(c.slug)} className={category === c.slug ? 'active' : ''}><Icon name={c.icon} /><span>{c.name}</span></button>)}</nav>
      <span className="toolbar-divider" />
      <label className="search"><Icon name="search" size={17} /><input aria-label="Поиск мест" placeholder="Найти место…" value={search} onChange={e => { setSearch(e.target.value); if (selected) selectPlace(null, true); }} />{search && <button aria-label="Очистить поиск" onClick={() => setSearch('')}><Icon name="close" size={14} /></button>}</label>
      <button className="theme-button" title={light ? 'Тёмная карта' : 'Светлая карта'} aria-label={light ? 'Тёмная карта' : 'Светлая карта'} onClick={() => setLight(!light)}><Icon name={light ? 'moon' : 'sun'} /></button>
    </header>
    {listOpen && <aside className="places-panel glass" aria-label="Каталог мест">
      <div className="panel-heading"><div><span className="wordmark">CHINA REPLICAS <span>中国</span></span><h1>Все места</h1></div><span className="place-count">{filtered.length} {placeLabel(filtered.length)}</span></div>
      <div className="catalog-caption"><span className={`status-dot ${demo ? 'demo' : ''}`} /><span>{demo ? 'Демо-подборка' : 'Архитектурные копии Китая'}</span><button onClick={toggleDemo}>{demo ? 'К каталогу' : 'Пример'}<Icon name="chevron" size={13} /></button></div>
      <div className="places-scroll" aria-live="polite">
        {!demo && (configurationError || error) && <p role="alert" className="notice">{configurationError || error}</p>}
        {!demo && loading ? <p className="empty-text">Загружаем места…</p> : filtered.length === 0 ? <div className="empty-state"><Icon name="pin" size={30} /><h2>{search || category !== 'all' ? 'Ничего не найдено' : 'Карта начинается с первого места'}</h2><p>{search || category !== 'all' ? 'Попробуйте другой запрос или категорию.' : 'Здесь появятся объекты из вашего архива после проверки.'}</p>{!demo && !search && <button className="outline-button" onClick={toggleDemo}>Посмотреть пример <Icon name="arrow" size={16} /></button>}</div>
          : Object.entries(groups).map(([city, group]) => <section className="city-group" key={city}><h2><Icon name="pin" size={15} />{city}<span>{group!.length}</span></h2>{group!.map(place => <button key={place.id} className={`place-card ${selected?.id === place.id ? 'selected' : ''}`} onClick={() => selectPlace(place)} aria-pressed={selected?.id === place.id}>
            <div className="card-copy"><span className="card-category"><i style={{ background: categoryColors[place.category] || categoryColors.other }} />{categories.find(c => c.slug === place.category)?.name || 'Архитектура'}</span><h3>{place.name}</h3><p>{place.description || place.original || 'Открыть место'}</p></div>
            {place.image ? <img src={place.image} alt={place.name} loading="lazy" /> : <div className="photo-placeholder"><Icon name="landmark" size={30} /></div>}
          </button>)}</section>)}
      </div>
      <div className="catalog-footer"><span>{demo ? 'Примеры · актуальность не проверена' : 'Исследуем архитектуру Китая'}</span><a href="/admin" className="editor-entry">Редакторам ↗</a></div>
    </aside>}
    <aside className={`details-panel glass ${selected || notFound ? 'has-selection' : ''}`} aria-label="Информация о месте">
      {selected ? <>
        <div className="detail-top"><span className="eyebrow">{selected.demo ? 'ПРИМЕР МЕСТА' : 'МЕСТО НА КАРТЕ'}</span><div className="detail-top-actions"><button aria-label="Скопировать ссылку на карточку" title="Скопировать ссылку" onClick={sharePlace}><Icon name="share" size={18} /></button><button aria-label="Закрыть карточку" onClick={() => selectPlace(null)}><Icon name="close" size={18} /></button></div></div>
        <div className="detail-scroll">
          <PhotoGallery key={selected.id} place={selected}/>
          <div className="detail-content"><span className="detail-city"><Icon name="pin" size={14} />{selected.city}</span><h2>{selected.name}</h2><p className="detail-description">{selected.description || 'Описание пока не добавлено.'}</p>
          {selected.original && <div className="original-block"><span>ВДОХНОВЛЕНО</span><strong>{selected.original}</strong></div>}
          <div className="coordinates"><span>Координаты · WGS84</span><code>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</code></div>
          {selected.demo && <p className="demo-note">Демонстрационная карточка. Существование и доступность объекта требуют отдельной проверки.</p>}
          {selected.source && <a className="source-link" href={selected.source} target="_blank" rel="noreferrer">Источник информации <Icon name="arrow" size={16} /></a>}
          {related.length > 0 && <section className="related-places"><span className="eyebrow">ПОХОЖИЕ МЕСТА</span>{related.map(place=><button key={place.id} onClick={()=>selectPlace(place)}><span>{place.city}</span><strong>{place.name}</strong><Icon name="chevron" size={15}/></button>)}</section>}
          {nextPlace && <button className="next-place" onClick={()=>selectPlace(nextPlace)}><span>Следующее место</span><strong>{nextPlace.name}</strong><Icon name="arrow" size={17}/></button>}
          </div>
        </div>
      </> : notFound ? <div className="not-found"><button aria-label="Закрыть" onClick={()=>selectPlace(null)}><Icon name="close" size={18}/></button><span>404</span><Icon name="pin" size={30}/><h2>Место не найдено</h2><p>Возможно, объект ещё не опубликован или адрес изменился.</p><button className="outline-button" onClick={()=>selectPlace(null)}>Вернуться к карте</button></div> : <div className="detail-welcome"><div className="welcome-icon"><Icon name="compass" size={24} /></div><h2>История<br />каждого места</h2><p>Выберите место на карте или в списке, чтобы увидеть фотографии, описание и архитектурный оригинал.</p><div className="welcome-divider" /><span className="eyebrow">НА КАРТЕ</span><ul><li><i style={{ background: categoryColors['landmark-replica'] }} />Копии достопримечательностей</li><li><i style={{ background: categoryColors['themed-town'] }} />Тематические города</li><li><i style={{ background: categoryColors['theme-park'] }} />Парки миниатюр</li></ul><span className="welcome-bottom">Атлас архитектурных копий Китая</span></div>}
    </aside>
    <div className="map-signature"><span>中国</span><div>CHINA REPLICAS<small>Атлас архитектурных копий</small></div></div>
    {shareStatus && <div className={`copy-toast ${shareStatus.startsWith('Не удалось') ? 'error' : ''}`} role="status"><Icon name={shareStatus.startsWith('Не удалось') ? 'close' : 'share'} size={17}/><span>{shareStatus}</span></div>}
  </main>;
}

import { useEffect, useState, type FormEvent } from 'react';
import { addCity, friendlyError, loadDetails, loadLookups, savePlace, uploadAttractionImage, type EditorPlace, type Log, type Lookup, type PlaceImage, type PlaceInput, type Source } from './api';
import { CoordinatePicker } from './CoordinatePicker';
const emptyPlace: PlaceInput = {name:'',slug:'',name_zh:'',original_name:'',description:'',city_id:'',category_id:'',latitude:null,longitude:null,existence_status:'unknown',visitor_status:'unknown',publication_status:'draft'};
export const publicationLabels: Record<string,string> = {draft:'Черновик',published:'Опубликован',archived:'В архиве'};
const existenceLabels: Record<string,string> = {unknown:'Не проверено',exists:'Существует',demolished:'Снесён',relocated:'Перемещён',not_found:'Не найден'};
const visitorLabels: Record<string,string> = {unknown:'Не проверено',open:'Открыт',closed:'Закрыт',restricted:'Доступ ограничен'};
export function PlaceEditor({place,onSaved,onCancel,onDirty}: {place:EditorPlace | null;onSaved:()=>Promise<void>;onCancel:()=>void;onDirty:(dirty:boolean)=>void}) {
  const [form,setForm]=useState<PlaceInput>(place || emptyPlace);
  const [sources,setSources]=useState<Source[]>([]);
  const [images,setImages]=useState<PlaceImage[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [lookups,setLookups]=useState<{categories:Lookup[];cities:Lookup[];provinces:Lookup[]}>({categories:[],cities:[],provinces:[]});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [review,setReview]=useState(false);
  const [evidence,setEvidence]=useState('');
  const [notes,setNotes]=useState('');
  const [provinceName,setProvinceName]=useState('');
  const [cityName,setCityName]=useState('');
  useEffect(()=> {
    let cancelled=false;
    Promise.all([loadLookups(),place ? loadDetails(place.id):Promise.resolve({sources:[],images:[],logs:[]})]).then(([lookup,details])=>{
      if(cancelled) return;setLookups(lookup);setSources(details.sources);setImages(details.images);setLogs(details.logs);setLoading(false);
    }).catch(e=>{if(!cancelled)setError(friendlyError(e));});
    return ()=>{cancelled=true;};
  },[place]);
  useEffect(()=>{if(error) document.querySelector('.admin-alert')?.scrollIntoView({block:'center'});},[error]);
  function change<K extends keyof PlaceInput>(key:K,value:PlaceInput[K]) {setForm(f=>({...f,[key]:value}));onDirty(true);}
  function coordinateChange(value:{latitude:number|null;longitude:number|null}) {setForm(f=>({...f,...value}));onDirty(true);}
  function sourceChange(index:number,patch:Partial<Source>) {setSources(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));onDirty(true);}
  function imageChange(index:number,patch:Partial<PlaceImage>) {setImages(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));onDirty(true);}
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');setSaving(true);
    try {
      await savePlace(form,sources,images,review?{evidence_urls:evidence.split('\n').map(s=>s.trim()).filter(Boolean),notes}:null,place?.updated_at || null);
      onDirty(false);
      await onSaved();
    } catch(e) {setError(friendlyError(e));} finally {setSaving(false);}
  }
  async function createCity() {
    setError('');setSaving(true);
    try {const id=await addCity(provinceName,cityName);setLookups(await loadLookups());change('city_id',id);setCityName('');setProvinceName('');}
    catch(e){setError(friendlyError(e));}finally{setSaving(false);}
  }
  async function uploadPhoto(file:File) {
    if(!place) {setError('Сначала сохраните новый объект, затем откройте его и добавьте фотографию.');return;}
    setError('');setUploading(true);
    try {
      const image_url=await uploadAttractionImage(place.id,file);
      setImages(rows=>[...rows,{image_url,image_type:'replica',source_url:'',license:'',attribution:'',sort_order:rows.length}]);
      onDirty(true);
    } catch(e) {setError(friendlyError(e));} finally {setUploading(false);}
  }
  return <form className="admin-editor" onSubmit={submit}>
    <div className="editor-heading"><div><p className="admin-eyebrow">КАТАЛОГ / {place?'РЕДАКТИРОВАНИЕ':'НОВЫЙ ОБЪЕКТ'}</p><h1>{place?.name || 'Новое место'}</h1></div><button type="button" className="admin-button" disabled={saving} onClick={onCancel}>Закрыть</button></div>
    {error && <div className="admin-alert" role="alert">{error}{loading && <button type="button" onClick={()=>location.reload()}>Перезагрузить</button>}</div>}
    {loading && !error && <p role="status">Загружаем данные объекта…</p>}
    <fieldset disabled={saving||loading||uploading} className="editor-fields">
    <section className="admin-section"><div className="section-title"><h2>Основная информация</h2><span>01</span></div>
      <div className="admin-grid"><label>Название<input required maxLength={200} value={form.name} onChange={e=>change('name',e.target.value)} placeholder="Название китайской копии" /></label><label>Название на китайском<input maxLength={200} value={form.name_zh} onChange={e=>change('name_zh',e.target.value)} /></label>
      <label>Slug<input required pattern="[a-z0-9-]+" maxLength={160} value={form.slug} onChange={e=>change('slug',e.target.value)} placeholder="tianducheng" /><small>Латинские буквы, цифры и дефисы</small></label><label>Оригинал<input maxLength={200} value={form.original_name} onChange={e=>change('original_name',e.target.value)} placeholder="Эйфелева башня, Париж" /></label>
      <label className="full-width">Описание<textarea rows={5} maxLength={20000} value={form.description} onChange={e=>change('description',e.target.value)} /></label>
      <label>Категория<select value={form.category_id} onChange={e=>change('category_id',e.target.value)}><option value="">Не выбрана</option>{lookups.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Город<select value={form.city_id} onChange={e=>change('city_id',e.target.value)}><option value="">Не выбран</option>{lookups.cities.map(c=><option key={c.id} value={c.id}>{c.name} · {lookups.provinces.find(p=>p.id===c.province_id)?.name}</option>)}</select></label></div>
      <details className="add-city"><summary>Добавить город в справочник</summary><div className="admin-grid"><label>Провинция<input list="province-options" value={provinceName} onChange={e=>setProvinceName(e.target.value)} /><datalist id="province-options">{lookups.provinces.map(p=><option key={p.id} value={p.name}/>)}</datalist></label><label>Город<input value={cityName} onChange={e=>setCityName(e.target.value)} /></label></div><button type="button" className="admin-button" onClick={createCity}>Добавить город</button></details>
    </section>
    <section className="admin-section"><div className="section-title"><h2>Расположение</h2><span>02</span></div><p className="field-hint">Координаты для карты в WGS84. Поставьте маркер кликом или перетащите его. Исходные координаты Baidu и других сервисов сохраняйте ниже, в источнике.</p><CoordinatePicker latitude={form.latitude} longitude={form.longitude} onChange={coordinateChange}/><div className="admin-grid coordinate-inputs"><label>Широта<input type="number" step="any" min={-90} max={90} value={form.latitude??''} onChange={e=>change('latitude',e.target.value===''?null:Number(e.target.value))}/></label><label>Долгота<input type="number" step="any" min={-180} max={180} value={form.longitude??''} onChange={e=>change('longitude',e.target.value===''?null:Number(e.target.value))}/></label></div></section>
    <section className="admin-section"><div className="section-title"><h2>Источники</h2><span>03</span></div><p className="field-hint">Ссылки будут видны посетителям после публикации объекта.</p>
      {sources.map((source,index)=><div className="admin-repeater" key={index}><div className="repeater-heading"><strong>Источник {index+1}</strong><button type="button" onClick={()=>{setSources(rows=>rows.filter((_,i)=>i!==index));onDirty(true);}}>Убрать</button></div><div className="admin-grid"><label>Тип<select value={source.source_type} onChange={e=>sourceChange(index,{source_type:e.target.value as Source['source_type']})}>{[['google','Google Maps'],['baidu','Baidu Maps'],['osm','OpenStreetMap'],['wikidata','Wikidata'],['official','Официальный сайт'],['other','Другой']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Ссылка<input type="url" required value={source.source_url} onChange={e=>sourceChange(index,{source_url:e.target.value})}/></label></div><details><summary>Исходные координаты</summary><div className="admin-grid"><label>Исходная широта<input type="number" step="any" min={-90} max={90} value={source.source_latitude??''} onChange={e=>sourceChange(index,{source_latitude:e.target.value===''?null:Number(e.target.value)})}/></label><label>Исходная долгота<input type="number" step="any" min={-180} max={180} value={source.source_longitude??''} onChange={e=>sourceChange(index,{source_longitude:e.target.value===''?null:Number(e.target.value)})}/></label><label>Система координат<select value={source.coordinate_system || 'unknown'} onChange={e=>sourceChange(index,{coordinate_system:e.target.value as Source['coordinate_system']})}>{['unknown','WGS84','GCJ02','BD09'].map(s=><option key={s} value={s}>{s==='unknown'?'Не установлена':s}</option>)}</select></label></div></details></div>)}
      <button type="button" className="admin-button" disabled={sources.length>=100} onClick={()=>{setSources(rows=>[...rows,{source_type:'other',source_url:'',source_latitude:null,source_longitude:null,coordinate_system:'unknown',checked_at:null}]);onDirty(true);}}>+ Добавить источник</button>
    </section>
    <section className="admin-section"><div className="section-title"><h2>Фотографии</h2><span>04</span></div><p className="field-hint">Загрузите JPEG, PNG, WebP или AVIF до 10 МБ либо добавьте прямую ссылку. Автор, лицензия и страница источника обязательны.</p>
      <div className="photo-upload"><label className={`admin-button ${!place?'disabled':''}`}>+ Загрузить файл<input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!place||uploading||images.length>=50} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void uploadPhoto(file);}}/></label><span>{uploading?'Загружаем фотографию…':place?'Файл добавится в список — заполните права и сохраните объект.':'Сначала сохраните новый объект.'}</span></div>
      {images.map((image,index)=><div className="admin-repeater photo-editor" key={index}><div className="repeater-heading"><strong>Фото {index+1}</strong><button type="button" onClick={()=>{setImages(rows=>rows.filter((_,i)=>i!==index));onDirty(true);}}>Убрать</button></div><div className="photo-preview"><img src={image.image_url} alt="" loading="lazy" referrerPolicy="no-referrer"/><span>{image.image_type==='replica'?'Копия':'Оригинал'}</span></div><div className="admin-grid"><label>Ссылка на изображение<input type="url" required value={image.image_url} onChange={e=>imageChange(index,{image_url:e.target.value})}/></label><label>Тип<select value={image.image_type} onChange={e=>imageChange(index,{image_type:e.target.value as PlaceImage['image_type']})}><option value="replica">Копия</option><option value="original">Оригинал</option></select></label><label>Автор<input required value={image.attribution} onChange={e=>imageChange(index,{attribution:e.target.value})}/></label><label>Лицензия<input required value={image.license} onChange={e=>imageChange(index,{license:e.target.value})} placeholder="Например, CC BY-SA 4.0"/></label><label>Страница источника<input type="url" required value={image.source_url} onChange={e=>imageChange(index,{source_url:e.target.value})}/></label><label>Порядок<input type="number" step={1} value={image.sort_order} onChange={e=>imageChange(index,{sort_order:Number(e.target.value)})}/></label></div></div>)}
      <button type="button" className="admin-button" disabled={images.length>=50} onClick={()=>{setImages(rows=>[...rows,{image_url:'',image_type:'replica',source_url:'',license:'',attribution:'',sort_order:rows.length}]);onDirty(true);}}>+ Добавить фото</button>
    </section>
    <section className="admin-section"><div className="section-title"><h2>Проверка и публикация</h2><span>05</span></div><div className="admin-grid"><label>Существование<select value={form.existence_status} onChange={e=>change('existence_status',e.target.value as PlaceInput['existence_status'])}>{Object.entries(existenceLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Доступность<select value={form.visitor_status} onChange={e=>change('visitor_status',e.target.value as PlaceInput['visitor_status'])}>{Object.entries(visitorLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
      <label className="admin-checkbox"><input type="checkbox" checked={review} onChange={e=>{setReview(e.target.checked);onDirty(true);}}/>Добавить запись проверки</label>
      {review && <div className="admin-grid"><label className="full-width">Подтверждающие ссылки — по одной в строке<textarea required rows={3} value={evidence} onChange={e=>{setEvidence(e.target.value);onDirty(true);}} placeholder="https://…"/></label><label className="full-width">Редакционная заметка<textarea rows={3} value={notes} onChange={e=>{setNotes(e.target.value);onDirty(true);}}/></label></div>}
      <label className="publication-select">Статус публикации<select value={form.publication_status} onChange={e=>change('publication_status',e.target.value as PlaceInput['publication_status'])}>{Object.entries(publicationLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><p className="field-hint">Для публикации нужны координаты, город, категория, источник и подтверждение существования. Архив скрывает объект с карты.</p>
      {place?.last_verified_at && <p className="field-hint">Последняя проверка: {new Date(place.last_verified_at).toLocaleString('ru')}</p>}
    </section>
    {logs.length>0 && <section className="admin-section"><div className="section-title"><h2>История проверок</h2></div>{logs.map(log=><article className="review-log" key={log.id}><strong>{new Date(log.verified_at).toLocaleString('ru')} · {existenceLabels[log.existence_status]}</strong><p>{visitorLabels[log.visitor_status]}{log.notes && ` · ${log.notes}`}</p>{log.evidence_urls.map(url=><a href={url} target="_blank" rel="noreferrer" key={url}>{url}</a>)}</article>)}</section>}
    </fieldset>
    <div className="editor-actions"><span>{saving?'Сохраняем…':place?'Изменения применятся после сохранения':'Новый объект не попадёт на карту, пока не опубликован'}</span><button type="submit" className="admin-button primary" disabled={saving||loading}>{saving?'Сохранение…':'Сохранить объект'}</button></div>
  </form>;
}

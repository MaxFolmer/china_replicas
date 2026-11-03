import { useMemo, useState } from 'react';
import { supabase } from '../../shared/lib/supabase';
import { friendlyError } from './api';

type RawRow=Record<string,unknown>;
type Candidate={row:number;raw:RawRow;name:string;latitude:number|null;longitude:number|null;sourceUrl:string;errors:string[];duplicate?:string};
type Existing={name:string;latitude:number|null;longitude:number|null};
const aliases={name:['name','title','название','place_name'],latitude:['latitude','lat','широта'],longitude:['longitude','lng','lon','долгота'],sourceUrl:['source_url','url','link','ссылка','google_maps_url','baidu_url']};
const pick=(row:RawRow,names:string[])=>{const key=Object.keys(row).find(k=>names.includes(k.trim().toLowerCase()));return key?String(row[key]??'').trim():'';};
function parseCsv(text:string):RawRow[]{
  const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(field);field='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))rows.push(row);row=[];}else field+=char;}
  row.push(field);if(row.some(Boolean))rows.push(row);if(rows.length<2)return[];
  const headers=rows[0].map((v,i)=>v.trim()||`column_${i+1}`);
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,i)=>[header,values[i]?.trim()??''])));
}
function parseFile(text:string,filename:string):RawRow[]{
  if(filename.toLowerCase().endsWith('.csv'))return parseCsv(text);
  const value=JSON.parse(text) as {type?:string;features?:Array<{type?:string;properties?:RawRow;geometry?:{type?:string;coordinates?:unknown[]}}>};
  if(value.type!=='FeatureCollection'||!Array.isArray(value.features))throw new Error('GeoJSON должен быть FeatureCollection.');
  return value.features.map(feature=>{const coordinates=feature.geometry?.type==='Point'?feature.geometry.coordinates:undefined;return {...(feature.properties||{}),...(coordinates?{longitude:coordinates[0],latitude:coordinates[1]}:{})};});
}
function candidate(raw:RawRow,row:number):Candidate{
  const name=pick(raw,aliases.name);const latText=pick(raw,aliases.latitude);const lonText=pick(raw,aliases.longitude);const sourceUrl=pick(raw,aliases.sourceUrl);
  const latitude=latText===''?null:Number(latText.replace(',','.'));const longitude=lonText===''?null:Number(lonText.replace(',','.'));const errors:string[]=[];
  if(!name)errors.push('Нет названия');if((latitude===null)!==(longitude===null))errors.push('Нужны обе координаты');if(latitude!==null&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90))errors.push('Неверная широта');if(longitude!==null&&(!Number.isFinite(longitude)||longitude < -180||longitude > 180))errors.push('Неверная долгота');if(sourceUrl&&!/^https?:\/\//.test(sourceUrl))errors.push('Неверная ссылка');
  return {row,raw,name,latitude,longitude,sourceUrl,errors};
}
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function findDuplicate(item:Candidate,existing:Existing[]){return existing.find(place=>normalize(place.name)===normalize(item.name))?.name||existing.find(place=>item.latitude!==null&&item.longitude!==null&&place.latitude!==null&&place.longitude!==null&&Math.hypot(place.latitude-item.latitude,place.longitude-item.longitude)<.0025)?.name;}

export function ImportWorkspace({onClose}:{onClose:()=>void}){
  const [filename,setFilename]=useState('');const [source,setSource]=useState('manual');const [items,setItems]=useState<Candidate[]>([]);const [error,setError]=useState('');const [success,setSuccess]=useState('');const [busy,setBusy]=useState(false);
  const ready=useMemo(()=>items.filter(item=>item.errors.length===0),[items]);
  async function choose(file:File){setError('');setSuccess('');setBusy(true);try{if(file.size>8*1024*1024)throw new Error('Файл должен быть не больше 8 МБ.');const raw=parseFile(await file.text(),file.name);if(!raw.length)throw new Error('В файле нет строк для импорта.');if(raw.length>5000)throw new Error('За один раз можно импортировать до 5000 строк.');const {data,error}=await supabase!.from('attractions').select('name,latitude,longitude').limit(5000);if(error)throw error;const index=(data||[]) as Existing[];setFilename(file.name);setItems(raw.map((value,i)=>candidate(value,i+1)).map(item=>({...item,duplicate:findDuplicate(item,index)})));}catch(e){setItems([]);setError(e instanceof SyntaxError?'Не удалось прочитать файл. Проверьте формат CSV или GeoJSON.':friendlyError(e));}finally{setBusy(false);}}
  async function save(){setBusy(true);setError('');try{const payload=ready.map(item=>({...item.raw,_import:{name:item.name,latitude:item.latitude,longitude:item.longitude,source_url:item.sourceUrl,possible_duplicate:item.duplicate||null}}));const {error}=await supabase!.rpc('admin_create_import_batch',{p_source:source,p_filename:filename,p_items:payload});if(error)throw error;setSuccess(`В очередь добавлено: ${payload.length}. Строки с ошибками пропущены.`);setItems([]);setFilename('');}catch(e){setError(friendlyError(e));}finally{setBusy(false);}}
  return <section className="admin-import"><div className="editor-heading"><div><p className="admin-eyebrow">ИМПОРТ</p><h1>CSV и GeoJSON</h1><p className="admin-subtitle">Предпросмотр, проверка координат и поиск возможных дублей</p></div><button className="admin-button" onClick={onClose}>Закрыть</button></div>
    {error&&<div className="admin-alert" role="alert">{error}</div>}{success&&<div className="admin-success" role="status">{success}</div>}
    <div className="admin-section import-drop"><label className="admin-button primary">{busy?'Читаем файл…':'Выбрать CSV или GeoJSON'}<input className="visually-hidden" type="file" accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(file);}}/></label><p>До 8 МБ и 5000 строк. Распознаются name/title, latitude/lat, longitude/lng и source_url/url.</p></div>
    {items.length>0&&<><div className="import-summary"><strong>{filename}</strong><span>Всего {items.length} · готовы {ready.length} · ошибки {items.length-ready.length} · возможные дубли {items.filter(i=>i.duplicate).length}</span><label>Источник<select value={source} onChange={e=>setSource(e.target.value)}><option value="manual">Ручная подборка</option><option value="google">Google Maps</option><option value="baidu">Baidu Maps</option></select></label></div><div className="admin-table-wrap"><table className="admin-table import-table"><thead><tr><th>#</th><th>Название</th><th>Координаты</th><th>Проверка</th></tr></thead><tbody>{items.slice(0,200).map(item=><tr key={item.row}><td data-label="Строка">{item.row}</td><td data-label="Название">{item.name||'—'}</td><td data-label="Координаты">{item.latitude!==null&&item.longitude!==null?`${item.latitude}, ${item.longitude}`:'—'}</td><td data-label="Проверка">{item.errors.length?<span className="import-error">{item.errors.join(' · ')}</span>:item.duplicate?<span className="import-warning">Возможный дубль: {item.duplicate}</span>:<span className="import-ok">Готово</span>}</td></tr>)}</tbody></table>{items.length>200&&<p className="field-hint import-limit">Показаны первые 200 строк из {items.length}.</p>}</div><div className="editor-actions"><span>Исходные строки сохранятся без изменений в приватной очереди.</span><button className="admin-button primary" disabled={busy||ready.length===0} onClick={save}>Добавить в очередь · {ready.length}</button></div></>}
  </section>;
}

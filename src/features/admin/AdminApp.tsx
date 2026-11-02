import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../shared/lib/supabase';
import { friendlyError, loadCatalog, type EditorPlace } from './api';
import { PlaceEditor, publicationLabels } from './PlaceEditor';
import { PasswordSettings } from './PasswordSettings';
import './admin.css';
function Login() {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [mode,setMode]=useState<'password'|'link'>('password');
  const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const [error,setError]=useState('');
  function switchMode(value:'password'|'link'){setMode(value);setPassword('');setError('');setSent(false);}
  async function submit(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try {
      if(mode==='password'){
        const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});
        setPassword('');
        if(error)setError(error.status===429?'Слишком много попыток. Подождите немного.':'Не удалось войти. Проверьте email и пароль или используйте вход по ссылке.');
      }else{
        const {error}=await supabase!.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${location.origin}/admin`,shouldCreateUser:false}});
        if(error)setError(error.code==='over_email_send_rate_limit'?'Лимит писем для входа исчерпан. Повторите позже. Если пароль уже установлен, выберите «По паролю».':error.status===429?'Слишком много попыток входа. Подождите несколько минут.':'Не удалось отправить ссылку. Проверьте email и повторите попытку.');else setSent(true);
      }
    }catch{setError('Не удалось подключиться. Повторите попытку.');}
    finally{setBusy(false);}
  }
  return <main className="admin-login"><a className="admin-back" href="/">← Вернуться к карте</a><div className="login-card"><p className="admin-eyebrow">CHINA REPLICAS / РЕДАКЦИЯ</p><h1>Вход в редактор</h1><p>Управление местами, источниками и проверками.</p>
    <div className="login-methods" role="group" aria-label="Способ входа"><button type="button" aria-pressed={mode==='password'} disabled={busy} onClick={()=>switchMode('password')}>По паролю</button><button type="button" aria-pressed={mode==='link'} disabled={busy} onClick={()=>switchMode('link')}>По ссылке</button></div>
    <form onSubmit={submit}><label>Email<input type="email" autoComplete="username" required value={email} disabled={busy} onChange={e=>{setEmail(e.target.value);setSent(false);}} placeholder="you@example.com"/></label>
      {mode==='password'&&<label>Пароль<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>}
      <button className="admin-button primary" disabled={busy||(mode==='link'&&sent)}>{busy?'Подождите…':mode==='password'?'Войти':sent?'Ссылка отправлена':'Получить ссылку для входа'}</button>
    </form>
    {sent&&<div className="admin-success" role="status">Если аккаунт существует, письмо со ссылкой для входа отправлено. Проверьте почту.</div>}
    {error&&<p className="admin-alert" role="alert">{error}</p>}
    <small>{mode==='password'?'Пароль ещё не установлен или забыт? Войдите по ссылке, затем откройте «Пароль» в админке.':'Вход по ссылке доступен существующим аккаунтам. Право редактирования назначает владелец проекта.'}</small>
  </div></main>;
}
function Workspace({session}:{session:Session}) {
  const [rows,setRows]=useState<EditorPlace[]>([]);const [count,setCount]=useState(0);const [page,setPage]=useState(0);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');
  const [selected,setSelected]=useState<EditorPlace|null|undefined>(undefined);const [dirty,setDirty]=useState(false);const [accountSettings,setAccountSettings]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await loadCatalog(page*50);setRows(result.rows);setCount(result.count);}catch(e){setError(friendlyError(e));}finally{setLoading(false);}},[page]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  function leave() {return !dirty || window.confirm('Есть несохранённые изменения. Закрыть редактор без сохранения?');}
  function open(place:EditorPlace|null|undefined) {if(leave()){setSelected(place);setAccountSettings(false);setDirty(false);setSuccess('');}}
  async function logout(){if(!leave())return;const {error}=await supabase!.auth.signOut();if(error)setError('Не удалось выйти. Попробуйте ещё раз.');}
  async function saved(){setDirty(false);setSelected(undefined);setSuccess('Объект сохранён.');await load();}
  const visible=rows.filter(p=>(status==='all'||p.publication_status===status)&&`${p.name} ${p.name_zh} ${p.slug}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="admin-workspace"><header className="admin-header"><a className="admin-brand" href="/">CR <span>CHINA REPLICAS</span></a><span className="editor-label">Редактор каталога</span><div><span className="admin-email">{session.user.email}</span><button className="admin-button" onClick={()=>{if(leave()){setSelected(undefined);setDirty(false);setAccountSettings(true);}}}>Пароль</button><button onClick={logout} className="admin-button">Выйти</button></div></header>
    <div className="admin-shell"><aside className="admin-sidebar"><span className="admin-eyebrow">РАБОЧАЯ ОБЛАСТЬ</span><button className="sidebar-active" onClick={()=>open(undefined)}>Объекты <span>{count}</span></button><a href="/">Открыть карту ↗</a><p>Публикуйте объекты после проверки координат и источников.</p></aside>
    <main className="admin-main">{accountSettings?<PasswordSettings onClose={()=>setAccountSettings(false)}/>:selected!==undefined?<PlaceEditor key={selected?.id || 'new'} place={selected} onDirty={setDirty} onCancel={()=>open(undefined)} onSaved={saved}/>:<>
      <div className="editor-heading"><div><p className="admin-eyebrow">КАТАЛОГ</p><h1>Объекты</h1><p className="admin-subtitle">Черновики, опубликованные места и архив</p></div><button className="admin-button primary" onClick={()=>open(null)}>+ Новое место</button></div>
      {error&&<div className="admin-alert" role="alert">{error}<button onClick={load}>Повторить</button></div>}{success&&<div className="admin-success" role="status">{success}</div>}
      <div className="admin-filters"><label><span className="visually-hidden">Поиск на текущей странице</span><input placeholder="Поиск по названию или slug" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><span className="visually-hidden">Статус объекта</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Все статусы</option>{Object.entries(publicationLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><span>Поиск по текущей странице</span></div>
      {loading?<p role="status" className="admin-empty">Загружаем каталог…</p>:rows.length===0?<div className="admin-empty"><span>01</span><h2>Добавьте первое место</h2><p>Начните с названия и источника. Остальное можно заполнить позже.</p><button className="admin-button" onClick={()=>open(null)}>Создать черновик</button></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Название</th><th>Статус</th><th>Обновлён</th><th><span className="visually-hidden">Действия</span></th></tr></thead><tbody>{visible.map(p=><tr key={p.id}><td><button className="place-title-button" onClick={()=>open(p)}>{p.name}</button><small>{p.slug}</small></td><td><span className={`publication-badge ${p.publication_status}`}>{publicationLabels[p.publication_status]}</span></td><td>{new Date(p.updated_at).toLocaleDateString('ru')}</td><td><button className="table-edit" aria-label={`Редактировать ${p.name}`} onClick={()=>open(p)}>Редактировать →</button></td></tr>)}</tbody></table>{visible.length===0&&<p className="admin-empty">На этой странице ничего не найдено.</p>}</div>}
      <div className="admin-pagination"><span>Всего: {count} · Страница {page+1}</span><div><button className="admin-button" disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>← Назад</button><button className="admin-button" disabled={(page+1)*50>=count||loading} onClick={()=>setPage(p=>p+1)}>Далее →</button></div></div>
    </>}</main></div></div>;
}
export default function AdminApp() {
  const [session,setSession]=useState<Session|null>(null);const [loading,setLoading]=useState(true);
  const [editor,setEditor]=useState<boolean|null>(null);const [checkedUserId,setCheckedUserId]=useState<string|null>(null);const userId=session?.user.id;const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let active=true;
    supabase.auth.getSession().then(({data,error})=>{if(active){setSession(data.session);setLoading(false);if(error)setError('Не удалось проверить сеанс. Обновите страницу.');}}).catch(()=>{if(active){setLoading(false);setError('Не удалось подключиться. Обновите страницу.');}});
    const {data}=supabase.auth.onAuthStateChange((_event,value)=>{if(active){setSession(value);setLoading(false);}});
    return()=>{active=false;data.subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    setEditor(null);setCheckedUserId(null);setError('');if(!userId)return;
    let active=true;supabase!.rpc('is_editor').then(({data,error})=>{if(active){if(error)setError('Не удалось проверить права. Проверьте подключение и применение миграции админки.');else {setEditor(data===true);setCheckedUserId(userId);}}});
    return()=>{active=false;};
  },[userId,attempt]);
  if(!supabase)return <main className="admin-message"><h1>База не подключена</h1><p>Настройте переменные подключения Supabase.</p><a href="/">К карте</a></main>;
  if(loading)return <main className="admin-message" role="status">Проверяем сеанс…</main>;
  if(!session)return <Login/>;
  if(error||editor===false)return <main className="admin-message"><p className="admin-eyebrow">CHINA REPLICAS / РЕДАКЦИЯ</p><h1>{error?'Не удалось проверить доступ':'Доступ редактора не назначен'}</h1><p>{error||`Вы вошли как ${session.user.email}. Владелец проекта должен назначить права этому аккаунту.`}</p><div><button className="admin-button" onClick={()=>setAttempt(n=>n+1)}>Проверить доступ</button><button className="admin-button" onClick={()=>supabase!.auth.signOut()}>Выйти</button><a href="/">К карте</a></div></main>;
  if(editor===null||checkedUserId!==session.user.id)return <main className="admin-message" role="status">Проверяем права редактора…</main>;
  return <Workspace session={session}/>;
}

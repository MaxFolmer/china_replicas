import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../shared/lib/supabase';
import { friendlyError } from './api';

type Editor = { user_id:string; email:string; role:'owner'|'editor'; created_at:string };
type Application = { id:string; user_id:string; email:string; contact:string; message:string; status:'pending'|'approved'|'rejected'; created_at:string; reviewed_at:string|null };
const statusLabel={pending:'Ожидает',approved:'Одобрена',rejected:'Отклонена'};

export function EditorsManager({onClose}:{onClose:()=>void}){
  const [editors,setEditors]=useState<Editor[]>([]);const [applications,setApplications]=useState<Application[]>([]);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [editorResult,applicationResult]=await Promise.all([supabase!.rpc('admin_list_editor_roles'),supabase!.rpc('admin_list_editor_applications')]);
      if(editorResult.error)throw editorResult.error;if(applicationResult.error)throw applicationResult.error;
      setEditors((editorResult.data||[]) as Editor[]);setApplications((applicationResult.data||[]) as Application[]);
    }catch(e){setError(friendlyError(e));}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function review(id:string,action:'approve'|'reject'){
    setBusy(id);setError('');setNotice('');
    try{const {error}=await supabase!.rpc('admin_review_editor_application',{p_id:id,p_action:action});if(error)throw error;setNotice(action==='approve'?'Заявка одобрена. Редактор может войти в админку.':'Заявка отклонена.');await load();}
    catch(e){setError(friendlyError(e));}finally{setBusy('');}
  }
  const pending=applications.filter(item=>item.status==='pending');
  return <section className="admin-editors"><div className="editor-heading"><div><p className="admin-eyebrow">ДОСТУП</p><h1>Редакторы</h1><p className="admin-subtitle">Регистрация с одобрением владельца</p></div><button className="admin-button" onClick={onClose}>Закрыть</button></div>
    {error&&<div className="admin-alert" role="alert">{error}</div>}{notice&&<div className="admin-success" role="status">{notice}</div>}
    <section className="admin-section"><div className="section-title"><h2>Новые заявки</h2><span>{pending.length}</span></div>{loading?<p>Загружаем…</p>:<div className="application-list">{pending.map(item=><article key={item.id}><div className="application-head"><div><strong>{item.email}</strong><span>{new Date(item.created_at).toLocaleString('ru')}</span></div><span className="invitation-status pending">Ожидает</span></div><p><b>Контакт:</b> {item.contact}</p>{item.message&&<blockquote>{item.message}</blockquote>}<div className="application-actions"><button className="admin-button primary" disabled={Boolean(busy)} onClick={()=>review(item.id,'approve')}>{busy===item.id?'Подождите…':'Одобрить'}</button><button className="admin-button danger" disabled={Boolean(busy)} onClick={()=>review(item.id,'reject')}>Отклонить</button></div></article>)}{!pending.length&&<p className="field-hint">Новых заявок пока нет.</p>}</div>}</section>
    <section className="admin-section"><div className="section-title"><h2>Активные редакторы</h2><span>{editors.length}</span></div><div className="access-list">{editors.map(item=><article key={item.user_id}><div><strong>{item.email||item.user_id}</strong><span>Добавлен {new Date(item.created_at).toLocaleDateString('ru')}</span></div><span className={`access-role ${item.role}`}>{item.role==='owner'?'Владелец':'Редактор'}</span></article>)}</div></section>
    <section className="admin-section"><div className="section-title"><h2>История заявок</h2><span>{applications.length-pending.length}</span></div><div className="access-list">{applications.filter(item=>item.status!=='pending').map(item=><article key={item.id}><div><strong>{item.email}</strong><span>{item.contact} · {item.reviewed_at?new Date(item.reviewed_at).toLocaleDateString('ru'):''}</span></div><span className={`invitation-status ${item.status==='approved'?'pending':''}`}>{statusLabel[item.status]}</span></article>)}{!loading&&applications.length===pending.length&&<p className="field-hint">Рассмотренных заявок пока нет.</p>}</div></section>
  </section>;
}

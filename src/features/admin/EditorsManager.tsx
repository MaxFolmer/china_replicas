import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../shared/lib/supabase';
import { friendlyError } from './api';

type Editor = { user_id:string; email:string; role:'owner'|'editor'; created_at:string };
type Invitation = { id:string; email:string; expires_at:string; accepted_at:string|null; revoked_at:string|null; created_at:string };

const invitationStatus=(item:Invitation)=>{
  if(item.accepted_at)return 'Принято';
  if(item.revoked_at)return 'Отозвано';
  if(new Date(item.expires_at)<new Date())return 'Истекло';
  return 'Ожидает';
};

export function EditorsManager({onClose}:{onClose:()=>void}){
  const [editors,setEditors]=useState<Editor[]>([]);const [invitations,setInvitations]=useState<Invitation[]>([]);
  const [email,setEmail]=useState('');const [inviteUrl,setInviteUrl]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const invoke=async(body:Record<string,unknown>)=>{const {data,error}=await supabase!.functions.invoke('editor-invitations',{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data;};
  const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await invoke({action:'list'});setEditors(data.editors||[]);setInvitations(data.invitations||[]);}catch(e){setError(friendlyError(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');setInviteUrl('');try{const data=await invoke({action:'create',email:email.trim()});setInviteUrl(data.invite_url);setEmail('');setNotice('Приглашение создано и действует 24 часа.');await load();}catch(e){setError(friendlyError(e));}finally{setBusy(false);}}
  async function copy(){if(!inviteUrl)return;await navigator.clipboard.writeText(inviteUrl);setNotice('Ссылка приглашения скопирована.');}
  async function revoke(id:string){setBusy(true);setError('');try{await invoke({action:'revoke',id});setNotice('Приглашение отозвано.');await load();}catch(e){setError(friendlyError(e));}finally{setBusy(false);}}
  return <section className="admin-editors"><div className="editor-heading"><div><p className="admin-eyebrow">ДОСТУП</p><h1>Редакторы</h1><p className="admin-subtitle">Закрытая регистрация по одноразовым приглашениям</p></div><button className="admin-button" onClick={onClose}>Закрыть</button></div>
    {error&&<div className="admin-alert" role="alert">{error}</div>}{notice&&<div className="admin-success" role="status">{notice}</div>}
    <form className="admin-section invitation-form" onSubmit={create}><div className="section-title"><h2>Пригласить редактора</h2><span>24 ЧАСА</span></div><div><label>Email<input type="email" required value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} placeholder="editor@example.com"/></label><button className="admin-button primary" disabled={busy}>{busy?'Подождите…':'Создать приглашение'}</button></div>
      {inviteUrl&&<div className="invite-link"><code>{inviteUrl}</code><button type="button" className="admin-button" onClick={copy}>Скопировать ссылку</button></div>}
      <p className="field-hint">Передайте ссылку редактору безопасным способом. После регистрации ссылка перестанет работать.</p>
    </form>
    <section className="admin-section"><div className="section-title"><h2>Активные редакторы</h2><span>{editors.length}</span></div>{loading?<p>Загружаем…</p>:<div className="access-list">{editors.map(item=><article key={item.user_id}><div><strong>{item.email||item.user_id}</strong><span>Добавлен {new Date(item.created_at).toLocaleDateString('ru')}</span></div><span className={`access-role ${item.role}`}>{item.role==='owner'?'Владелец':'Редактор'}</span></article>)}</div>}</section>
    <section className="admin-section"><div className="section-title"><h2>Приглашения</h2><span>{invitations.length}</span></div><div className="access-list">{invitations.map(item=>{const status=invitationStatus(item);return <article key={item.id}><div><strong>{item.email}</strong><span>До {new Date(item.expires_at).toLocaleString('ru')}</span></div><span className={`invitation-status ${status==='Ожидает'?'pending':''}`}>{status}</span>{status==='Ожидает'&&<button className="admin-button danger" disabled={busy} onClick={()=>revoke(item.id)}>Отозвать</button>}</article>})}{!loading&&!invitations.length&&<p className="field-hint">Приглашений пока нет.</p>}</div></section>
  </section>;
}


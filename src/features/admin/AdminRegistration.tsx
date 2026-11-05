import { useState, type FormEvent } from 'react';
import { supabase } from '../../shared/lib/supabase';
import './admin.css';

export default function AdminRegistration(){
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [contact,setContact]=useState('');const [message,setMessage]=useState('');const [website,setWebsite]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [complete,setComplete]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setError('');
    if(password!==confirm){setError('Пароли не совпадают.');return;}
    if(password.length<10){setError('Пароль должен содержать не менее 10 символов.');return;}
    setBusy(true);
    try{
      const normalizedEmail=email.trim().toLowerCase();
      const {data,error:signUpError}=await supabase!.auth.signUp({email:normalizedEmail,password});
      if(signUpError)throw signUpError;
      if(!data.user||data.user.identities?.length===0)throw new Error('account_exists');
      const {error:applicationError}=await supabase!.rpc('submit_editor_application',{
        p_user_id:data.user.id,p_email:normalizedEmail,p_contact:contact.trim(),p_message:message.trim(),p_website:website,
      });
      if(applicationError)throw applicationError;
      setPassword('');setConfirm('');setComplete(true);
    }catch(e){
      const value=e as {message?:string;code?:string};const code=value.message||value.code||'';
      const messages:Record<string,string>={account_exists:'Аккаунт с таким email уже существует. Войдите в админку или обратитесь к владельцу.',invalid_application:'Проверьте контакт и длину сообщения.',account_required:'Не удалось связать заявку с аккаунтом. Повторите регистрацию.',already_editor:'Этот аккаунт уже имеет доступ редактора.'};
      setError(messages[code]||'Не удалось отправить заявку. Проверьте данные и повторите попытку.');
    }finally{setBusy(false);}
  }
  if(!supabase)return <main className="admin-message"><h1>База не подключена</h1></main>;
  if(complete)return <main className="admin-login"><div className="login-card"><p className="admin-eyebrow">CHINA REPLICAS / РЕДАКЦИЯ</p><h1>Заявка отправлена</h1><p>Подтвердите email, если Supabase отправил письмо. После одобрения владельцем войдите по email и паролю.</p><a className="admin-button primary" href="/admin">Перейти ко входу</a></div></main>;
  return <main className="admin-login"><a className="admin-back" href="/">← Вернуться к карте</a><div className="login-card application-card"><p className="admin-eyebrow">ЗАЯВКА РЕДАКТОРА</p><h1>Стать редактором</h1><p>Создайте аккаунт и расскажите, как с вами связаться. Доступ появится после проверки владельцем.</p><form onSubmit={submit}>
    <label>Email<input type="email" autoComplete="username" required value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Пароль<input type="password" autoComplete="new-password" required minLength={10} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
    <label>Повторите пароль<input type="password" autoComplete="new-password" required minLength={10} value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></label>
    <label>Контакт для связи<input required minLength={2} maxLength={150} placeholder="Telegram, WeChat или другой контакт" value={contact} disabled={busy} onChange={e=>setContact(e.target.value)}/></label>
    <label>Небольшое сообщение <span>необязательно</span><textarea maxLength={1000} rows={4} placeholder="Расскажите о себе и почему хотите помочь проекту" value={message} disabled={busy} onChange={e=>setMessage(e.target.value)}/></label>
    <label className="application-honeypot" aria-hidden="true">Сайт<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
    <button className="admin-button primary" disabled={busy}>{busy?'Отправляем заявку…':'Отправить заявку'}</button>
  </form>{error&&<p className="admin-alert" role="alert">{error}</p>}<small>Пароль хранится и обрабатывается только Supabase Auth. Контакт и сообщение увидит владелец проекта.</small></div></main>;
}

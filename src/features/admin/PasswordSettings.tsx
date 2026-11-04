import { useState, type FormEvent } from 'react';
import { supabase } from '../../shared/lib/supabase';
export function PasswordSettings({onClose}:{onClose:()=>void}) {
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');setSaved(false);
    if(password.length<12){setError('Используйте не менее 12 символов.');return;}
    if(password!==confirmation){setError('Пароли не совпадают.');return;}
    setBusy(true);
    try {
      const {error}=await supabase!.auth.updateUser({password});
      if(error){
        const messages:Record<string,string>={reauthentication_needed:'Выйдите и снова войдите с текущим паролем, затем повторите изменение.',same_password:'Этот пароль уже используется. Выберите другой.',weak_password:'Этот пароль не соответствует требованиям безопасности. Выберите более надёжный.'};
        setError(messages[error.code || ''] || (error.status===429?'Слишком много попыток. Повторите позже.':'Не удалось сохранить пароль. Войдите заново и повторите попытку.'));
      }else{setPassword('');setConfirmation('');setSaved(true);}
    }catch{setError('Не удалось подключиться. Повторите попытку.');}
    finally{setBusy(false);}
  }
  return <form className="admin-password-settings" onSubmit={submit}>
    <div className="editor-heading"><div><p className="admin-eyebrow">АККАУНТ</p><h1>Пароль для входа</h1></div><button type="button" className="admin-button" disabled={busy} onClick={onClose}>Закрыть</button></div>
    <section className="admin-section"><p className="field-hint">Измените пароль своего аккаунта. Для входа в редактор используются email и пароль.</p>
      {error&&<div className="admin-alert" role="alert">{error}</div>}
      {saved&&<div className="admin-success" role="status">Пароль сохранён. Теперь можно выйти и войти по email и паролю.</div>}
      <fieldset disabled={busy} className="editor-fields"><div className="admin-grid"><label>Новый пароль<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>{setPassword(e.target.value);setSaved(false);}}/><small>Не менее 12 символов. Используйте уникальный пароль.</small></label><label>Повторите пароль<input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e=>{setConfirmation(e.target.value);setSaved(false);}}/></label></div><button className="admin-button primary password-save" disabled={busy}>{busy?'Сохраняем…':'Сохранить пароль'}</button></fieldset>
    </section>
  </form>;
}

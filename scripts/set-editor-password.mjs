// Owner-only, interactive account provisioning. Never imported by the frontend.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

if (!stdin.isTTY || !stdout.isTTY) {
  console.error('Запустите команду в своём интерактивном терминале. Не передавайте ключ или пароль аргументами.');
  process.exit(1);
}
const projectUrl = process.env.VITE_SUPABASE_URL;
try {
  const url = new URL(projectUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/') throw new Error();
} catch {
  console.error('В .env.local укажите VITE_SUPABASE_URL вашего облачного проекта Supabase.');
  process.exit(1);
}
let hidden = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) stdout.write(chunk); done(); } });
const rl = createInterface({ input: stdin, output, terminal: true, historySize: 0 });
rl.on('SIGINT', () => { stdout.write('\nОтменено.\n'); rl.close(); process.exit(130); });
async function secret(label) {
  stdout.write(label);
  hidden = true;
  try { return await rl.question(''); }
  finally { hidden = false; stdout.write('\n'); }
}
function privilegedKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; }
  catch { return false; }
}
try {
  console.log(`Проект: ${projectUrl}`);
  console.log('Команда меняет пароль существующего подтверждённого аккаунта. Права редактора не изменяются.');
  const email = (await rl.question('Email аккаунта: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Проверьте email.');
  const key = (await secret('Secret key Supabase или legacy service_role key (скрыто): ')).trim();
  if (!privilegedKey(key)) throw new Error('Нужен серверный Secret key или service_role key. Публичный publishable/anon key не подходит.');
  const client = createClient(projectUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let account;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('Не удалось прочитать аккаунт. Проверьте проект, Secret key и сетевой доступ.');
    account = data.users.find(user => user.email?.toLowerCase() === email);
    if (account || data.users.length < 100) break;
  }
  if (!account) throw new Error('Аккаунт не найден. Проверьте email и выбранный проект. Новый аккаунт не создавался.');
  if (!account.email_confirmed_at) throw new Error('Сначала подтвердите email аккаунта. Команда не подтверждает почту автоматически.');
  const password = await secret('Новый пароль (не менее 12 символов, скрыто): ');
  const confirmation = await secret('Повторите пароль (скрыто): ');
  if (password.length < 12) throw new Error('Используйте не менее 12 символов.');
  if (password !== confirmation) throw new Error('Пароли не совпадают.');
  const answer = await rl.question(`Установить пароль аккаунту ${email} в этом проекте? Введите «да»: `);
  if (answer.trim().toLowerCase() !== 'да') throw new Error('Отменено. Пароль не изменён.');
  const { error } = await client.auth.admin.updateUserById(account.id, { password });
  if (error) {
    if (error.code === 'weak_password') throw new Error('Supabase отклонил пароль как недостаточно надёжный.');
    if (error.code === 'same_password') throw new Error('Этот пароль уже используется.');
    throw new Error('Supabase не подтвердил смену пароля. Не повторяйте запрос автоматически; проверьте доступ через форму входа.');
  }
  console.log('Пароль установлен. Откройте /admin и войдите по email и паролю. Письмо для входа не требуется.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
  process.exitCode = 1;
} finally { rl.close(); }

import { useState } from 'react';
import {
  dengluZhanghu, zhuceZhanghu, qingqiuHuifuCode, chongzhiZhanghuMima
} from '../../api/account.js';

export default function AccountScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhoneCountryCode, setRecoveryPhoneCountryCode] = useState('+86');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [channel, setChannel] = useState('email');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login') {
        onAuthenticated(await dengluZhanghu({ username, password }));
      } else if (mode === 'register') {
        onAuthenticated(await zhuceZhanghu({
          username, password, nickname, recoveryEmail,
          recoveryPhoneCountryCode, recoveryPhone
        }));
      } else if (mode === 'recover-request') {
        const result = await qingqiuHuifuCode({ username, channel });
        setNotice(result.message || '如果账户存在且已设置此找回方式，验证码将会寄出。');
        setMode('recover-reset');
      } else {
        const result = await chongzhiZhanghuMima({ username, code, newPassword });
        setNotice(result.message || '密码已重设，请使用新密码登录。');
        setPassword('');
        setNewPassword('');
        setMode('login');
      }
    } catch (err) {
      setError(err.message || '目前无法完成账户操作');
    } finally {
      setBusy(false);
    }
  }

  const login = mode === 'login';
  const register = mode === 'register';
  const requesting = mode === 'recover-request';
  const resetting = mode === 'recover-reset';

  return (
    <main className="v2-account">
      <div className="v2-account-mark">語未央</div>
      <section className="v2-account-panel">
        <p className="v2-eyebrow">{login ? '欢迎回来' : register ? '开始学习' : '账户安全'}</p>
        <h1>{login ? '回到语未央' : register ? '开垦你的第一片土地' : requesting ? '找回账户' : '重设密码'}</h1>
        <p className="v2-muted">学习进度、错词与花园记忆都会跟着你的账户保存。</p>

        <form onSubmit={submit} className="v2-form">
          <label>账号
            <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" minLength={3} maxLength={24} required />
          </label>
          {register && <>
            <label>昵称
              <input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} autoComplete="nickname" required />
            </label>
            <label>找回邮箱（选填）
              <input type="email" value={recoveryEmail} onChange={e => { setRecoveryEmail(e.target.value); if (e.target.value) setRecoveryPhone(''); }} autoComplete="email" />
            </label>
            <label>手机国际区号（与邮箱二选一）
              <input value={recoveryPhoneCountryCode} onChange={e => setRecoveryPhoneCountryCode(e.target.value)} placeholder="+86" />
            </label>
            <label>找回手机号
              <input type="tel" value={recoveryPhone} onChange={e => { setRecoveryPhone(e.target.value); if (e.target.value) setRecoveryEmail(''); }} autoComplete="tel" />
            </label>
            <p className="v2-muted">设置邮箱或手机号，之后才能通过对应方式找回密码。找回服务需完成邮件或短信通道配置。</p>
          </>}
          {(login || register) && <label>密码
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength={8} maxLength={128} autoComplete={login ? 'current-password' : 'new-password'} required />
          </label>}
          {requesting && <>
            <label>验证码发送方式
              <select value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="email">电子邮箱</option>
                <option value="phone">手机短信</option>
              </select>
            </label>
          </>}
          {resetting && <>
            <label>6 位验证码
              <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </label>
            <label>新密码
              <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
            </label>
          </>}
          {error && <p className="v2-error" role="alert">{error}</p>}
          {notice && <p className="v2-muted" role="status">{notice}</p>}
          <button className="v2-primary" disabled={busy}>{busy ? '正在处理…' : login ? '登录' : register ? '建立账户' : requesting ? '发送验证码' : '重设密码'}</button>
        </form>

        <div className="v2-account-links">
          {login && <>
            <button className="v2-text-button" onClick={() => { setMode('register'); setError(''); setNotice(''); }}>还没有账户？建立账户</button>
            <button className="v2-text-button" onClick={() => { setMode('recover-request'); setError(''); setNotice(''); }}>忘记密码</button>
          </>}
          {register && <button className="v2-text-button" onClick={() => { setMode('login'); setError(''); setNotice(''); }}>已有账户？登录</button>}
          {requesting && <button className="v2-text-button" onClick={() => { setMode('login'); setError(''); setNotice(''); }}>返回登录</button>}
          {resetting && <button className="v2-text-button" onClick={() => { setMode('recover-request'); setError(''); setNotice(''); }}>重新申请验证码</button>}
        </div>
      </section>
    </main>
  );
}

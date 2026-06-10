import { login, register } from '../auth.js';
import { showToast } from '../ui.js';
import { updateSidebar } from '../ui.js';
import { updateAuthMenu } from '../menu.js';
import { t } from '../i18n.js';

export function renderLogin(container, navigate) {
  renderAuthForm(container, navigate, 'login');
}

export function renderRegister(container, navigate) {
  renderAuthForm(container, navigate, 'register');
}

function renderAuthForm(container, navigate, mode) {
  const isLogin = mode === 'login';

  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo">V</div>
          <h2>Violence</h2>
          <p>${isLogin ? t('auth.loginTitle') : t('auth.registerTitle')}</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab ${isLogin ? 'active' : ''}" data-auth-tab="login">${t('auth.login')}</button>
          <button class="auth-tab ${!isLogin ? 'active' : ''}" data-auth-tab="register">${t('auth.register')}</button>
        </div>

        <form class="auth-form" id="auth-form" autocomplete="on">
          ${isLogin ? `
            <label class="auth-label">${t('auth.identifier')}</label>
            <input class="text-input auth-input" type="text" name="identifier" id="auth-identifier"
              placeholder="${t('auth.identifierPh')}" required autocomplete="username" />
          ` : `
            <label class="auth-label">${t('auth.loginLabel')}</label>
            <input class="text-input auth-input" type="text" name="login" id="auth-login"
              placeholder="${t('auth.loginPh')}" required autocomplete="username" minlength="3" maxlength="24" />

            <label class="auth-label">${t('auth.email')}</label>
            <input class="text-input auth-input" type="email" name="email" id="auth-email"
              placeholder="${t('auth.emailPh')}" required autocomplete="email" />
          `}

          <label class="auth-label">${t('auth.password')}</label>
          <input class="text-input auth-input" type="password" name="password" id="auth-password"
            placeholder="••••••••" required autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6" />

          ${!isLogin ? `
            <label class="auth-label">${t('auth.passwordConfirm')}</label>
            <input class="text-input auth-input" type="password" name="passwordConfirm" id="auth-password-confirm"
              placeholder="••••••••" required autocomplete="new-password" minlength="6" />
          ` : ''}

          <p class="auth-error" id="auth-error" hidden></p>

          <button class="btn btn-primary auth-submit" type="submit" id="auth-submit">
            ${isLogin ? t('auth.submitLogin') : t('auth.submitRegister')}
          </button>
        </form>

        <p class="auth-hint">
          ${isLogin
            ? `${t('auth.noAccount')} <button type="button" class="auth-link" data-auth-tab="register">${t('auth.register')}</button>`
            : `${t('auth.hasAccount')} <button type="button" class="auth-link" data-auth-tab="login">${t('auth.login')}</button>`}
        </p>

        <button class="btn btn-ghost auth-guest" type="button" id="auth-guest">${t('auth.guestContinue')}</button>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-auth-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.authTab === 'login' ? 'login' : 'register');
    });
  });

  document.getElementById('auth-guest')?.addEventListener('click', () => navigate('home'));

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');
    errEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = isLogin ? 'Вход…' : 'Регистрация…';

    try {
      if (isLogin) {
        await login({
          identifier: document.getElementById('auth-identifier').value,
          password: document.getElementById('auth-password').value,
        });
        showToast('Добро пожаловать!', 'success');
      } else {
        await register({
          login: document.getElementById('auth-login').value,
          email: document.getElementById('auth-email').value,
          password: document.getElementById('auth-password').value,
          passwordConfirm: document.getElementById('auth-password-confirm').value,
        });
        showToast('Аккаунт создан!', 'success');
      }
      updateSidebar();
      updateAuthMenu();
      navigate('home');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? t('auth.submitLogin') : t('auth.submitRegister');
    }
  });
}

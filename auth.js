const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorBox = document.getElementById('error-box');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}

function clearError() {
  errorBox.textContent = '';
  errorBox.style.display = 'none';
}

function switchTab(mode) {
  clearError();
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  loginForm.classList.toggle('hidden', mode !== 'login');
  registerForm.classList.toggle('hidden', mode !== 'register');
}

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;

  const users = JSON.parse(localStorage.getItem('mdt_users')) || [];

  if (users.some(u => u.email === email)) {
    return showError('Ky email është i regjistruar më parë!');
  }

  const newUser = { id: Date.now(), name, email, password };
  users.push(newUser);
  localStorage.setItem('mdt_users', JSON.stringify(users));
  localStorage.setItem('mdt_currentUser', JSON.stringify({ id: newUser.id, name, email }));

  window.location.href = 'index.html';
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  const users = JSON.parse(localStorage.getItem('mdt_users')) || [];
  const validUser = users.find(u => u.email === email && u.password === password);

  if (!validUser) {
    return showError('Email-i ose fjalëkalimi është i pasaktë!');
  }

  localStorage.setItem('mdt_currentUser', JSON.stringify({
    id: validUser.id,
    name: validUser.name,
    email: validUser.email
  }));

  window.location.href = 'index.html';
});

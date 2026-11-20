const $ = selector => document.querySelector(selector);
let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  $('#login-tab').classList.toggle('active', !signup);
  $('#signup-tab').classList.toggle('active', signup);
  $('#name-field').hidden = !signup;
  $('#name').required = signup;
  $('#password').autocomplete = signup ? 'new-password' : 'current-password';
  $('#heading').textContent = signup ? 'Krijo llogarinë tënde' : 'Mirë se u ktheve';
  $('#intro').textContent = signup ? 'Nis të organizosh ditën, një detyrë në herë.' : 'Kyçu në llogarinë tënde për të vazhduar.';
  $('#submit-btn').textContent = signup ? 'Krijo llogari' : 'Kyçu në llogari';
  $('#error').textContent = '';
}

async function api(url, data) {
  const response = await fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Kërkesa nuk u krye. Provo përsëri.');
  return result;
}

fetch('/api/me', { credentials: 'same-origin' }).then(response => {
  if (response.ok) window.location.replace('index.html');
}).catch(() => {});

$('#login-tab').addEventListener('click', () => setMode('login'));
$('#signup-tab').addEventListener('click', () => setMode('signup'));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#error').textContent = '';
  $('#submit-btn').disabled = true;
  $('#submit-btn').textContent = 'Duke u lidhur…';
  const data = { email: $('#email').value.trim(), password: $('#password').value };
  if (mode === 'signup') data.name = $('#name').value.trim();
  try {
    await api(mode === 'signup' ? '/api/register' : '/api/login', data);
    window.location.replace('index.html');
  } catch (error) {
    $('#error').textContent = error.message;
    $('#submit-btn').disabled = false;
    $('#submit-btn').textContent = mode === 'signup' ? 'Krijo llogari' : 'Kyçu në llogari';
  }
});

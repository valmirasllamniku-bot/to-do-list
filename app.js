const $ = selector => document.querySelector(selector);
let currentUser = null;
let tasks = [];
const taskForm = $('#task-form');
const taskList = $('#task-list');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    credentials: 'same-origin'
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.replace('auth.html');
    throw new Error(result.error || 'Kërkesa nuk u krye. Provo përsëri.');
  }
  return result;
}
function showMessage(message = '') {
  const banner = $('#app-message');
  banner.textContent = message;
  banner.hidden = !message;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function renderTasks() {
  const query = $('#search-input').value.trim().toLocaleLowerCase('sq');
  const status = $('#filter-status').value;
  const sort = $('#sort-by').value;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const visible = tasks.filter(task => {
    const matches = `${task.title} ${task.desc} ${task.category}`.toLocaleLowerCase('sq').includes(query);
    return matches && (status === 'all' || (status === 'completed') === task.completed);
  }).sort((a, b) => sort === 'priority'
    ? priorityRank[a.priority] - priorityRank[b.priority] || a.dueDate.localeCompare(b.dueDate)
    : a.dueDate.localeCompare(b.dueDate));

  const completed = tasks.filter(task => task.completed).length;
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $('#progress-text').textContent = `${completed} / ${tasks.length} të përfunduara (${percent}%)`;
  $('#progress-fill').style.width = `${percent}%`;
  $('#task-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'detyrë' : 'detyra'}`;
  $('#empty-state').hidden = visible.length > 0;
  $('#empty-state').querySelector('strong').textContent = tasks.length ? 'Nuk u gjet asnjë detyrë' : 'Lista jote është bosh';
  $('#empty-state').querySelector('span').textContent = tasks.length ? 'Provo një kërkim ose filtër tjetër.' : 'Shto detyrën e parë dhe nis ditën me qartësi.';

  taskList.innerHTML = visible.map(task => {
    const overdue = !task.completed && task.dueDate < new Date().toISOString().slice(0, 10);
    const dateLabel = new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('sq-AL', { day: 'numeric', month: 'short', year: 'numeric' });
    const priorityLabel = { high: 'I lartë', medium: 'Mesatar', low: 'I ulët' }[task.priority] || 'Mesatar';
    return `<article class="task-item${task.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}" data-id="${escapeHtml(task.id)}">
      <label class="task-check"><input type="checkbox" data-action="toggle" aria-label="Shëno ${escapeHtml(task.title)} si të përfunduar" ${task.completed ? 'checked' : ''}><span class="checkmark"></span></label>
      <div class="task-content"><h3 class="task-title">${escapeHtml(task.title)}</h3>
        ${task.desc ? `<p class="task-desc">${escapeHtml(task.desc)}</p>` : ''}
        <div class="task-meta"><span class="meta-date${overdue ? ' is-overdue' : ''}">${overdue ? 'Afati kaloi · ' : 'Afati · '}${dateLabel}</span><span>${escapeHtml(task.category)}</span><span class="badge prio-${escapeHtml(task.priority)}">${priorityLabel}</span></div>
      </div>
      <div class="task-actions"><button class="icon-btn" data-action="edit" aria-label="Ndrysho detyrën" title="Ndrysho">✎</button><button class="icon-btn delete-btn" data-action="delete" aria-label="Fshi detyrën" title="Fshi">×</button></div>
    </article>`;
  }).join('');
}
async function loadTasks() {
  const result = await api('/api/tasks');
  tasks = result.tasks;
  renderTasks();
}

taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  showMessage();
  const editId = $('#edit-id').value;
  const task = {
    title: $('#task-title').value.trim(), desc: $('#task-desc').value.trim(),
    dueDate: $('#task-date').value, category: $('#task-category').value,
    priority: $('#task-priority').value
  };
  if (!task.title || !task.dueDate) return;
  try {
    if (editId) await api(`/api/tasks/${encodeURIComponent(editId)}`, { method: 'PUT', body: JSON.stringify(task) });
    else await api('/api/tasks', { method: 'POST', body: JSON.stringify(task) });
    taskForm.reset();
    $('#edit-id').value = '';
    $('#task-date').value = new Date().toISOString().slice(0, 10);
    $('#submit-btn').textContent = '+ Shto detyrën';
    $('#cancel-edit').hidden = true;
    await loadTasks();
  } catch (error) { showMessage(error.message); }
});

taskList.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const article = button.closest('[data-id]');
  const task = tasks.find(item => item.id === article.dataset.id);
  if (!task) return;
  showMessage();
  if (button.dataset.action === 'edit') {
    $('#edit-id').value = task.id;
    $('#task-title').value = task.title;
    $('#task-desc').value = task.desc;
    $('#task-date').value = task.dueDate;
    $('#task-category').value = task.category;
    $('#task-priority').value = task.priority;
    $('#submit-btn').textContent = 'Ruaj ndryshimet';
    $('#cancel-edit').hidden = false;
    $('#task-title').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  try {
    if (button.dataset.action === 'toggle') {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PUT', body: JSON.stringify({ completed: button.checked })
      });
    } else if (button.dataset.action === 'delete') {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    }
    await loadTasks();
  } catch (error) { showMessage(error.message); }
});

$('#cancel-edit').addEventListener('click', () => {
  taskForm.reset();
  $('#edit-id').value = '';
  $('#task-date').value = new Date().toISOString().slice(0, 10);
  $('#submit-btn').textContent = '+ Shto detyrën';
  $('#cancel-edit').hidden = true;
  showMessage();
});
$('#search-input').addEventListener('input', renderTasks);
$('#filter-status').addEventListener('change', renderTasks);
$('#sort-by').addEventListener('change', renderTasks);
$('#logout-btn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } finally { window.location.replace('auth.html'); }
});
$('#task-date').value = new Date().toISOString().slice(0, 10);

(async () => {
  try {
    const result = await api('/api/me');
    currentUser = result.user;
    $('#welcome-user').textContent = `Përshëndetje, ${currentUser.name}`;
    $('#user-avatar').textContent = Array.from(currentUser.name)[0]?.toLocaleUpperCase('sq') || 'P';
    await loadTasks();
  } catch (error) {
    if (error.message !== 'Sesioni skadoi. Kyçu përsëri.') showMessage(error.message);
  }
})();

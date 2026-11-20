// Kontrollo nëse përdoruesi është i kyçur (FR-01)
const currentUser = JSON.parse(localStorage.getItem('mdt_currentUser'));
if (!currentUser) {
  window.location.href = 'auth.html';
}

document.getElementById('welcome-user').textContent = `Përshëndetje, ${currentUser.name}`;

const storageKey = `mdt_tasks_${currentUser.id}`;
let tasks = JSON.parse(localStorage.getItem(storageKey)) || [];

const taskForm = document.getElementById('task-form');
const taskList = document.getElementById('task-list');

function saveTasks() {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
  renderTasks();
}

// Shtimi ose përditësimi i detyrës (FR-02 & FR-04)
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const editId = document.getElementById('edit-id').value;
  const title = document.getElementById('task-title').value.trim();
  const desc = document.getElementById('task-desc').value.trim();
  const dueDate = document.getElementById('task-date').value;
  const category = document.getElementById('task-category').value;
  const priority = document.getElementById('task-priority').value;

  if (editId) {
    const idx = tasks.findIndex(t => t.id === Number(editId));
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], title, desc, dueDate, category, priority };
    }
    document.getElementById('edit-id').value = '';
    document.getElementById('submit-btn').textContent = '+ Shto Dety
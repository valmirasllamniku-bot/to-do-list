const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const SQLITE_FILE = path.join(DATA_DIR, 'ditari.sqlite');
const PORT = Number(process.env.PORT) || 3000;
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 32 * 1024;
let database = { users: [], tasks: [] };
let sqlite;

async function loadDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  sqlite = new DatabaseSync(SQLITE_FILE);
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      dueDate TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_user_due_date ON tasks(userId, dueDate);
    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
  `);

  const userCount = sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const taskCount = sqlite.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
  try {
    const stored = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    const legacyUsers = Array.isArray(stored.users) ? stored.users : [];
    const legacyTasks = Array.isArray(stored.tasks) ? stored.tasks : [];
    if (userCount === 0 && taskCount === 0 && (legacyUsers.length || legacyTasks.length)) {
      database = { users: legacyUsers, tasks: legacyTasks };
      await saveDatabase();
      console.log(`U importuan ${legacyUsers.length} llogari dhe ${legacyTasks.length} detyra në SQLite.`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  database = {
    users: sqlite.prepare('SELECT id, name, email, passwordHash, salt, createdAt, expiresAt FROM users').all(),
    tasks: sqlite.prepare('SELECT id, userId, title, "desc" AS desc, dueDate, category, priority, completed, createdAt FROM tasks').all()
      .map(task => ({ ...task, completed: Boolean(task.completed) }))
  };
  const now = Date.now();
  sqlite.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(now);
  for (const session of sqlite.prepare('SELECT tokenHash, userId, expiresAt FROM sessions').all()) {
    sessions.set(session.tokenHash, { userId: session.userId, expiresAt: session.expiresAt });
  }
}
async function saveDatabase() {
  if (!sqlite) return;
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec('DELETE FROM tasks; DELETE FROM users;');
    const insertUser = sqlite.prepare('INSERT INTO users (id, name, email, passwordHash, salt, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertTask = sqlite.prepare('INSERT INTO tasks (id, userId, title, "desc", dueDate, category, priority, completed, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const user of database.users) insertUser.run(user.id, user.name, user.email, user.passwordHash, user.salt, user.createdAt, user.expiresAt || 0);
    for (const task of database.tasks) insertTask.run(task.id, task.userId, task.title, task.desc || '', task.dueDate, task.category, task.priority, task.completed ? 1 : 0, task.createdAt || new Date().toISOString());
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
function send(res, status, payload, headers = {}) {
  const body = payload === null ? '' : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}
function getUser(req) {
  const pair = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('ditari_session='));
  if (!pair) return null;
  const token = pair.slice('ditari_session='.length);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessionInfo = sessions.get(tokenHash);
  if (!sessionInfo) return null;
  const session = database.users.find(user => user.id === sessionInfo.userId);
  if (!session || sessionInfo.expiresAt < Date.now()) {
    sessions.delete(tokenHash);
    sqlite.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
    return null;
  }
  return { user: session, tokenHash };
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error('Kërkesa është tepër e madhe.'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error('Të dhënat nuk janë JSON të vlefshme.'), { status: 400 }); }
}
function validText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email }; }
function taskForOwner(task, userId) { return task.userId === userId; }

async function handleApi(req, res, url) {
  if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
    const ip = req.socket.remoteAddress || 'local';
    const now = Date.now();
    const attempts = (loginAttempts.get(ip) || []).filter(time => now - time < 10 * 60 * 1000);
    if (attempts.length >= 20) return send(res, 429, { error: 'Shumë tentativa. Provo përsëri pas pak.' });
    attempts.push(now);
    loginAttempts.set(ip, attempts);
    const input = await readJson(req);
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) {
      return send(res, 400, { error: 'Shkruaj një email të vlefshëm dhe fjalëkalim me të paktën 8 karaktere.' });
    }
    let user;
    if (url.pathname === '/api/register') {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!validText(name, 80)) return send(res, 400, { error: 'Emri duhet të ketë 1 deri në 80 karaktere.' });
      if (database.users.some(item => item.email === email)) return send(res, 409, { error: 'Ky email është regjistruar. Provo të kyçesh.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
      user = { id: crypto.randomUUID(), name, email, passwordHash: hash.toString('hex'), salt, createdAt: new Date().toISOString(), expiresAt: 0 };
      database.users.push(user);
      await saveDatabase();
    } else {
      user = database.users.find(item => item.email === email);
      if (!user) return send(res, 401, { error: 'Email-i ose fjalëkalimi nuk është i saktë.' });
      const hash = await scrypt(password, user.salt, 64, { N: 16384, r: 8, p: 1 });
      if (!crypto.timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'))) return send(res, 401, { error: 'Email-i ose fjalëkalimi nuk është i saktë.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + SESSION_MS;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    sessions.set(tokenHash, { userId: user.id, expiresAt });
    sqlite.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').run(tokenHash, user.id, expiresAt);
    user.expiresAt = expiresAt;
    await saveDatabase();
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `ditari_session=${token}; ${cookieOptions(SESSION_MS / 1000)}` });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = getUser(req);
    if (session) {
      sessions.delete(session.tokenHash);
      sqlite.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(session.tokenHash);
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': `ditari_session=; ${cookieOptions(0)}` });
  }
  const session = getUser(req);
  if (url.pathname.startsWith('/api/')) {
    if (!session) return send(res, 401, { error: 'Sesioni skadoi. Kyçu përsëri.' });
    const user = session.user;
    if (req.method === 'GET' && url.pathname === '/api/me') return send(res, 200, { user: publicUser(user) });
    if (req.method === 'GET' && url.pathname === '/api/tasks') return send(res, 200, { tasks: database.tasks.filter(task => taskForOwner(task, user.id)) });
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const input = await readJson(req);
      const task = validateTask(input);
      if (!task) return send(res, 400, { error: 'Kontrollo titullin, afatin, kategorinë dhe prioritetin.' });
      const created = { ...task, id: crypto.randomUUID(), userId: user.id, completed: false, createdAt: new Date().toISOString() };
      database.tasks.unshift(created);
      await saveDatabase();
      return send(res, 201, { task: created });
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)$/i);
    if (taskMatch && ['PUT', 'DELETE'].includes(req.method)) {
      const index = database.tasks.findIndex(task => task.id === taskMatch[1] && taskForOwner(task, user.id));
      if (index < 0) return send(res, 404, { error: 'Detyra nuk u gjet.' });
      if (req.method === 'DELETE') {
        database.tasks.splice(index, 1);
        await saveDatabase();
        return send(res, 200, { ok: true });
      }
      const input = await readJson(req);
      const update = validateTask(input, true);
      if (!update) return send(res, 400, { error: 'Të dhënat e detyrës nuk janë të vlefshme.' });
      database.tasks[index] = { ...database.tasks[index], ...update };
      await saveDatabase();
      return send(res, 200, { task: database.tasks[index] });
    }
    return send(res, 404, { error: 'Adresa API nuk u gjet.' });
  }
  return false;
}
function validateTask(input, partial = false) {
  const categories = ['Punë', 'Shkollë', 'Personale'];
  const priorities = ['high', 'medium', 'low'];
  const result = {};
  if (input.title !== undefined || !partial) {
    if (!validText(input.title, 120)) return null;
    result.title = input.title.trim();
  }
  if (input.desc !== undefined || !partial) {
    if (typeof (input.desc ?? '') !== 'string' || (input.desc || '').length > 300) return null;
    result.desc = (input.desc || '').trim();
  }
  if (input.dueDate !== undefined || !partial) {
    if (typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`))) return null;
    result.dueDate = input.dueDate;
  }
  if (input.category !== undefined || !partial) {
    if (!categories.includes(input.category)) return null;
    result.category = input.category;
  }
  if (input.priority !== undefined || !partial) {
    if (!priorities.includes(input.priority)) return null;
    result.priority = input.priority;
  }
  if (input.completed !== undefined) {
    if (typeof input.completed !== 'boolean') return null;
    result.completed = input.completed;
  }
  return result;
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, url);
      if (result !== false) return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metoda nuk lejohet.' });
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/auth.html';
    const allowedFiles = new Set(['/auth.html', '/index.html', '/auth.js', '/app.js']);
    if (!allowedFiles.has(pathname)) return send(res, 404, { error: 'Faqja nuk u gjet.' });
    const filename = path.resolve(ROOT, `.${pathname}`);
    const body = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    res.end(body);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    send(res, error.status || 500, { error: error.status ? error.message : 'Ndodhi një gabim i papritur.' });
    if (!error.status) console.error(error);
  }
});

loadDatabase().then(() => server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`Ditari po punon në portin ${PORT}.`);
})).catch(error => {
  console.error('Nuk u hap databaza lokale.', error);
  process.exitCode = 1;
});

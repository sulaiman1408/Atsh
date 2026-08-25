// خادم صغير جدًا: مسؤول فقط عن تسجيل الدخول/إنشاء الحساب لتطبيق "قطة العتش".
// لا يخزّن أي بيانات عن الرحلات أو المصاريف — تلك تبقى بالكامل في متصفح المستخدم.

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET environment variable.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL; disabled automatically when no DATABASE_URL
  // is set (e.g. quick local smoke tests against a local, non-SSL Postgres).
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      smoker BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const app = express();
// الصفحة قد تُفتح من file://، GitHub Pages، أو داخل Claude Artifact — لا كوكيز مستخدمة
// (فقط Bearer token)، فالسماح بأي أصل هنا مقبول لتطبيق شخصي بسيط كهذا.
app.use(cors({ origin: true }));
app.use(express.json());

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '180d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، سجّلوا الدخول مجددًا' });
  }
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post('/api/signup', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();
  const smoker = !!req.body.smoker;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'أدخلوا بريدًا إلكترونيًا صحيحًا' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
  }
  if (!name) {
    return res.status(400).json({ error: 'أدخلوا اسمًا' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, smoker) VALUES ($1, $2, $3, $4) RETURNING id, email, name, smoker',
      [email, hash, name, smoker]
    );
    const user = result.rows[0];
    res.status(201).json({
      token: signToken(user),
      user: { email: user.email, name: user.name, smoker: user.smoker },
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجّل مسبقًا' });
    }
    console.error(e);
    res.status(500).json({ error: 'تعذّر إنشاء الحساب، حاولوا لاحقًا' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const GENERIC_ERROR = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';

  try {
    const result = await pool.query(
      'SELECT id, email, name, smoker, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: GENERIC_ERROR });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: GENERIC_ERROR });

    res.json({
      token: signToken(user),
      user: { email: user.email, name: user.name, smoker: user.smoker },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'تعذّر تسجيل الدخول، حاولوا لاحقًا' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT email, name, smoker FROM users WHERE id = $1', [
      req.auth.sub,
    ]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'تعذّر جلب بيانات الحساب' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on ${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to initialize database schema', e);
    process.exit(1);
  });

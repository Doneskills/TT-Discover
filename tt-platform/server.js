const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.set('trust proxy', 1); // so req.ip is the real visitor on Render
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- Email notifications ----------------
// Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Works with Gmail, SendGrid/Mailgun SMTP relay, or any standard SMTP provider.
// Until these are set, emails are just logged to the console instead of sent —
// nothing breaks, this just quietly does nothing until credentials are added.
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS){
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
} else {
  console.log('Email notifications: SMTP_HOST/SMTP_USER/SMTP_PASS not set — emails will be logged, not sent.');
}
const MAIL_FROM = process.env.SMTP_FROM || 'TT Discover <notifications@ttdiscover.example>';

async function sendMail(to, subject, html){
  if (!mailTransporter){
    const links = (String(html).match(/href="([^"]+)"/g) || []).map(h => h.slice(6, -1));
    console.log(`[email not sent — no SMTP configured] To: ${to} | Subject: ${subject}${links.length ? ' | Link: ' + links.join(' ') : ''}`);
    return;
  }
  try {
    await mailTransporter.sendMail({ from: MAIL_FROM, to, subject, html });
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
  }
}

// Notifies every customer account whose chosen area matches, one email each.
// A failed send for one customer never blocks the others.
async function notifyAreaCustomers(area, subject, buildHtml){
  if (!usersCol || !area) return;
  try {
    const customers = await usersCol.find({ accountType: 'customer', preferredArea: area }).toArray();
    await Promise.all(customers.map(c => sendMail(c.email, subject, buildHtml(c))));
  } catch (err) {
    console.error('notifyAreaCustomers failed:', err.message);
  }
}

// Photo arrays, stored as data URLs (already resized/compressed client-side).
// Used for the business's own photo gallery, menu photos and highlights.
// How many each group may hold depends on the owner's plan (customer photos on the Photos page are separate and not limited by this).
const PHOTO_LIMIT = { free: 5, premium: 20 };
function sanitizePhotoArray(arr){
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, PHOTO_LIMIT.premium).map(u => String(u || '').slice(0, 400000)).filter(Boolean);
}
function effectivePlan(u){
  if (!u || u.plan !== 'premium') return 'free';
  if (u.premiumMethod === 'wipay' && u.premiumExpiresAt && new Date(u.premiumExpiresAt) < new Date()) return 'free';
  return 'premium';
}
// Returns an error message if the request would put MORE photos on a page than the plan allows.
// Pages that already hold more (older listings) can keep them or remove some, just not add.
function photoLimitError(body, plan, existing){
  const limit = PHOTO_LIMIT[plan];
  const groups = [['photos', 'photos'], ['menuPhotos', 'menu photos'], ['highlights', 'highlight photos']];
  for (const [key, label] of groups){
    if (!Array.isArray(body[key])) continue;
    const next = body[key].filter(Boolean).length;
    const prev = existing && Array.isArray(existing[key]) ? existing[key].length : 0;
    if (next > limit && next > prev){
      return plan === 'premium'
        ? `This page has reached the limit of ${limit} ${label}.`
        : `Free business pages can have up to ${limit} ${label}. Upgrade to Premium to add more.`;
    }
  }
  return '';
}

// About tab attributes — all optional, Google-Maps-style info chips.
const ABOUT_FIELDS = ['accessibility', 'serviceOptions', 'popularFor', 'offerings', 'diningOptions', 'atmosphere', 'crowd', 'payments', 'children', 'parking'];
function sanitizeAbout(obj){
  const clean = {};
  if (obj && typeof obj === 'object'){
    ABOUT_FIELDS.forEach(k => {
      const v = String(obj[k] || '').trim().slice(0, 200);
      if (v) clean[k] = v;
    });
  }
  return clean;
}

// Social links — all optional.
const SOCIAL_FIELDS = ['facebook', 'instagram', 'website'];
function sanitizeSocial(obj){
  const clean = {};
  if (obj && typeof obj === 'object'){
    SOCIAL_FIELDS.forEach(k => {
      const v = String(obj[k] || '').trim().slice(0, 300);
      if (v) clean[k] = v;
    });
  }
  return clean;
}


// ---------------- Safety helpers: rate limits, tokens, verification ----------------
const rateBuckets = new Map();
function rateCheck(key, max, windowMs){ // counts one hit; true while still under the limit
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.reset < now) b = { count: 0, reset: now + windowMs };
  b.count++;
  rateBuckets.set(key, b);
  return b.count <= max;
}
function rateBlocked(key, max){ const b = rateBuckets.get(key); return !!(b && b.reset > Date.now() && b.count >= max); }
function rateClear(key){ rateBuckets.delete(key); }
setInterval(() => { const now = Date.now(); for (const [k, b] of rateBuckets) if (b.reset < now) rateBuckets.delete(k); }, 10 * 60 * 1000).unref();

function escapeRegex(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function siteUrl(req){ return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, ''); }

async function issueVerifyToken(req, userId, email){
  const raw = crypto.randomBytes(24).toString('hex');
  await usersCol.updateOne({ _id: userId }, { $set: { verifyTokenHash: sha256(raw), verifyExpires: new Date(Date.now() + 48 * 60 * 60 * 1000) } });
  const link = `${siteUrl(req)}/api/verify-email?token=${raw}`;
  sendMail(email, 'Confirm your email for TT Discover',
    `<p>Welcome to TT Discover!</p><p><a href="${link}">Confirm my email</a></p><p>This link works for 48 hours. If you didn't create an account, you can ignore this email.</p>`);
}

// Only enforced once email sending is set up (SMTP), otherwise nobody could ever verify.
// Accounts created before this feature have no emailVerified flag and are treated as verified.
function requireVerified(req, res, next){
  if (mailTransporter && req.user && req.user.emailVerified === false){
    return res.status(403).json({ error: 'Please confirm your email first. Check your inbox (and spam) for our message.', needsVerification: true });
  }
  next();
}

let businessesCol = null;
let usersCol = null;
let photosCol = null;
let invitesCol = null;
let reportsCol = null;

// ---------------- Weekly hours (Mon-Sun open/close per day) ----------------
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Accepts the new per-day object from account.html's hours picker, or a plain
// string (e.g. from admin.html's old-style text field) — stores either safely.
function sanitizeHours(h){
  if (h && typeof h === 'object' && !Array.isArray(h)){
    const clean = {};
    DAY_KEYS.forEach(k => {
      const d = h[k] || {};
      clean[k] = {
        closed: !!d.closed,
        open: TIME_RE.test(d.open) ? d.open : '09:00',
        close: TIME_RE.test(d.close) ? d.close : '17:00'
      };
    });
    return clean;
  }
  return String(h || '').slice(0, 100);
}

function to12Hour(t){
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

// Turns the per-day hours object into a readable summary, grouping
// consecutive days that share the same hours (e.g. "Mon–Fri: 9:00 AM – 5:00 PM, Sat–Sun: Closed").
function formatHours(h){
  if (!h) return '';
  if (typeof h === 'string') return h;
  const groups = [];
  DAY_KEYS.forEach(k => {
    const d = h[k];
    if (!d) return;
    const text = d.closed ? 'Closed' : `${to12Hour(d.open)} – ${to12Hour(d.close)}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(DAY_LABELS[k]);
    else groups.push({ text, days: [DAY_LABELS[k]] });
  });
  return groups.map(g => {
    const label = g.days.length > 1 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days[0];
    return `${label}: ${g.text}`;
  }).join(', ');
}

async function initDb(){
  if (!process.env.MONGODB_URI){
    console.log('No MONGODB_URI set — the site will run but nothing will save.');
    return;
  }
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('tt_platform');
    businessesCol = db.collection('businesses');
    usersCol = db.collection('users');
    photosCol = db.collection('photoUploads');
    invitesCol = db.collection('collabInvites');
    reportsCol = db.collection('reports');
    console.log('Connected to database.');
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
}
initDb();

async function requireUser(req, res, next){
  const token = req.headers['x-auth-token'];
  if (!token || !usersCol) return res.status(401).json({ error: 'Not signed in' });
  try {
    const user = await usersCol.findOne({ sessionToken: token });
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Not signed in' });
  }
}

function requireAdmin(req, res, next){
  const provided = req.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || provided !== process.env.ADMIN_PASSWORD){
    return res.status(401).json({ error: 'Incorrect admin password' });
  }
  next();
}

// Accounts created before this feature have no accountType saved — treat those as business accounts.
function requireBusinessAccount(req, res, next){
  if (req.user.accountType === 'customer'){
    return res.status(403).json({ error: 'This account is set up for updates only, not for managing a business listing.' });
  }
  next();
}

// True if this user can fully manage a business — the original owner, or a
// co-owner/collaborator they've added. Collaborators get full day-to-day
// access (edit info, posts, jobs, deals, staff); only the original owner can
// delete the listing or manage the collaborator list itself.
function canManageBiz(biz, userId){
  if (!biz || !userId) return false;
  if (biz.ownerId === userId) return true;
  return (biz.collaborators || []).some(c => c.userId === userId);
}

// Allows either the business owner (x-auth-token) OR a staff member with the
// matching permission (x-staff-token) to proceed. Attaches req.biz either way,
// so handlers don't need to re-fetch or re-check ownership themselves.
function requireBizPermission(permission){
  return async function(req, res, next){
    if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
    let biz;
    try {
      biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    } catch (err) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    if (!biz) return res.status(404).json({ error: 'Business not found.' });

    const ownerToken = req.headers['x-auth-token'];
    if (ownerToken && usersCol){
      const user = await usersCol.findOne({ sessionToken: ownerToken });
      if (user && canManageBiz(biz, user._id.toString())){
        req.biz = biz;
        req.actor = { type: 'owner' };
        return next();
      }
    }

    const staffToken = req.headers['x-staff-token'];
    if (staffToken){
      const staffMember = (biz.staff || []).find(s => s.sessionToken === staffToken);
      if (staffMember && staffMember.permissions && staffMember.permissions[permission]){
        req.biz = biz;
        req.actor = { type: 'staff', staffMember };
        return next();
      }
    }

    return res.status(403).json({ error: 'You do not have permission to do that.' });
  };
}

// ---------------- Public API ----------------
app.get('/api/businesses', async (req, res) => {
  if (!businessesCol) return res.json([]);
  try {
    const q = escapeRegex(String(req.query.q || '').trim().slice(0, 60));
    const matchStage = q
      ? { $match: { $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } }
        ] } }
      : { $match: {} };

    const list = await businessesCol.aggregate([
      matchStage,
      {
        $lookup: {
          from: 'users',
          let: { ownerIdStr: '$ownerId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$ownerIdStr'] } } },
            { $project: { plan: 1, premiumMethod: 1, premiumExpiresAt: 1 } }
          ],
          as: 'ownerInfo'
        }
      },
      {
        $addFields: {
          ownerIsPremium: {
            $let: {
              vars: { owner: { $arrayElemAt: ['$ownerInfo', 0] } },
              in: {
                $and: [
                  { $eq: ['$$owner.plan', 'premium'] },
                  { $or: [
                      { $ne: ['$$owner.premiumMethod', 'wipay'] },
                      { $eq: ['$$owner.premiumExpiresAt', null] },
                      { $gt: ['$$owner.premiumExpiresAt', '$$NOW'] }
                  ] }
                ]
              }
            }
          }
        }
      },
      {
        $addFields: {
          isFeatured: { $or: [ { $eq: ['$featured', true] }, '$ownerIsPremium' ] }
        }
      },
      { $sort: { isFeatured: -1, name: 1 } },
      { $project: { ownerInfo: 0, ownerIsPremium: 0, staff: 0 } }
    ]).toArray();

    res.json(list);
  } catch (err) {
    console.error('Fetch businesses failed:', err.message);
    res.json([]);
  }
});

app.get('/api/businesses/:id', async (req, res) => {
  if (!businessesCol) return res.status(404).json({ error: 'Not found' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) }, { projection: { staff: 0 } });
    if (!biz) return res.status(404).json({ error: 'Not found' });
    res.json(biz);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// Records one page view for today (UTC date key) — fire-and-forget from the client.
app.post('/api/businesses/:id/view', async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    await businessesCol.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { [`viewsByDay.${today}`]: 1 } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not record view.' });
  }
});

function escapeHtml(s){
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.get('/biz/:id', async (req, res) => {
  if (!businessesCol) return res.status(404).send('Not found');
  let biz;
  try {
    biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) }, { projection: { name: 1, description: 1, imageUrl: 1 } });
  } catch (err) {
    biz = null;
  }
  if (!biz) return res.status(404).send('<h1>Listing not found</h1><a href="/">Back to TT Discover</a>');

  const today = new Date().toISOString().slice(0, 10);
  if (!req.query.embed) businessesCol.updateOne({ _id: biz._id }, { $inc: { [`viewsByDay.${today}`]: 1 } }).catch(() => {});

  const title = escapeHtml(biz.name) + ' — TT Discover';
  const desc = escapeHtml((biz.description || '').slice(0, 160));
  const meta = `<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">`;
  try {
    const html = require('fs').readFileSync(path.join(__dirname, 'public', 'biz.html'), 'utf8');
    res.send(html.replace('<!--META-->', meta));
  } catch (err) {
    res.status(500).send('Page template missing.');
  }
});

// ---------------- Accounts (for business owners) ----------------
app.post('/api/signup', async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    if (!rateCheck('signup-ip:' + req.ip, 10, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many sign-ups from this connection. Please try again later.' });
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const accountType = req.body && req.body.accountType === 'customer' ? 'customer' : 'business';
    if (!email || !password || password.length < 6){
      return res.status(400).json({ error: 'Email and a password of at least 6 characters are required.' });
    }
    const existing = await usersCol.findOne({ email });
    if (existing) return res.status(400).json({ error: 'An account with that email already exists.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const sessionToken = crypto.randomBytes(24).toString('hex');
    // Email confirmation only starts once email sending is set up; before that nobody could confirm.
    const created = await usersCol.insertOne({ email, passwordHash, sessionToken, accountType, ...(mailTransporter ? { emailVerified: false } : {}), createdAt: new Date() });
    if (mailTransporter) issueVerifyToken(req, created.insertedId, email).catch(() => {});
    res.json({ token: sessionToken, email });
  } catch (err) {
    console.error('Signup failed:', err.message);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const ipKey = 'login-ip:' + req.ip, emailKey = 'login:' + email;
    if (rateBlocked(ipKey, 30) || rateBlocked(emailKey, 8)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
    const user = await usersCol.findOne({ email });
    const ok = user && await bcrypt.compare(password, user.passwordHash);
    if (!ok){
      rateCheck(ipKey, 30, 15 * 60 * 1000); rateCheck(emailKey, 8, 15 * 60 * 1000);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    rateClear(emailKey);
    const sessionToken = crypto.randomBytes(24).toString('hex');
    await usersCol.updateOne({ _id: user._id }, { $set: { sessionToken } });
    res.json({ token: sessionToken, email: user.email });
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Could not log in.' });
  }
});


// ---------------- Email verification and password reset ----------------
app.get('/api/verify-email', async (req, res) => {
  try {
    const raw = String(req.query.token || '');
    if (!raw || !usersCol) return res.redirect('/account.html?verified=0');
    const user = await usersCol.findOne({ verifyTokenHash: sha256(raw), verifyExpires: { $gt: new Date() } });
    if (!user) return res.redirect('/account.html?verified=0');
    await usersCol.updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { verifyTokenHash: '', verifyExpires: '' } });
    res.redirect('/account.html?verified=1');
  } catch (err) {
    res.redirect('/account.html?verified=0');
  }
});

app.post('/api/resend-verification', requireUser, async (req, res) => {
  if (req.user.emailVerified !== false) return res.json({ ok: true, alreadyVerified: true });
  if (!rateCheck('resend:' + req.user._id.toString(), 3, 60 * 60 * 1000)) return res.status(429).json({ error: 'Please wait a bit before asking for another email.' });
  await issueVerifyToken(req, req.user._id, req.user.email);
  res.json({ ok: true });
});

app.post('/api/forgot-password', async (req, res) => {
  res.json({ ok: true }); // same answer whether or not the email exists
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!email || !usersCol) return;
    if (!rateCheck('fp-ip:' + req.ip, 10, 60 * 60 * 1000) || !rateCheck('fp:' + email, 3, 60 * 60 * 1000)) return;
    const user = await usersCol.findOne({ email });
    if (!user) return;
    const raw = crypto.randomBytes(24).toString('hex');
    await usersCol.updateOne({ _id: user._id }, { $set: { resetTokenHash: sha256(raw), resetExpires: new Date(Date.now() + 60 * 60 * 1000) } });
    const link = `${siteUrl(req)}/account.html?reset=${raw}`;
    sendMail(email, 'Reset your TT Discover password',
      `<p>We got a request to reset your password.</p><p><a href="${link}">Choose a new password</a></p><p>This link works for 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same.</p>`);
  } catch (err) {
    console.error('Forgot password failed:', err.message);
  }
});

app.post('/api/reset-password', async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    if (!rateCheck('rp-ip:' + req.ip, 20, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    const raw = String((req.body && req.body.token) || '');
    const password = String((req.body && req.body.password) || '');
    if (password.length < 6) return res.status(400).json({ error: 'Choose a password of at least 6 characters.' });
    const user = raw && await usersCol.findOne({ resetTokenHash: sha256(raw), resetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please ask for a new one.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const sessionToken = crypto.randomBytes(24).toString('hex'); // signs out any other devices
    await usersCol.updateOne({ _id: user._id }, { $set: { passwordHash, sessionToken, emailVerified: true }, $unset: { resetTokenHash: '', resetExpires: '' } });
    res.json({ token: sessionToken, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Could not reset password.' });
  }
});

app.get('/api/me', requireUser, async (req, res) => {
  let user = req.user;
  if (user.plan === 'premium' && user.premiumMethod === 'wipay' && user.premiumExpiresAt && new Date(user.premiumExpiresAt) < new Date()){
    await usersCol.updateOne({ _id: user._id }, { $set: { plan: 'free' } });
    user.plan = 'free';
  }
  res.json({
    id: user._id.toString(),
    email: user.email,
    accountType: user.accountType === 'customer' ? 'customer' : 'business',
    emailVerified: user.emailVerified !== false,
    verificationRequired: !!mailTransporter,
    preferredArea: user.preferredArea || null,
    plan: user.plan || 'free',
    photoLimit: PHOTO_LIMIT[effectivePlan(user)],
    premiumMethod: user.premiumMethod || null,
    premiumExpiresAt: user.premiumExpiresAt || null,
    username: user.username || '',
    realName: user.realName || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || ''
  });
});

app.post('/api/me/preferences', requireUser, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const preferredArea = String((req.body && req.body.preferredArea) || '').slice(0, 100);
    await usersCol.updateOne({ _id: req.user._id }, { $set: { preferredArea } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not save preferences.' });
  }
});

// Lets a customer ("for updates") account become a business account with the same login.
app.post('/api/me/account-type', requireUser, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    if (!req.body || req.body.accountType !== 'business') return res.status(400).json({ error: 'Only switching to a business account is supported.' });
    if (req.user.accountType !== 'customer') return res.json({ ok: true, accountType: 'business' });
    await usersCol.updateOne({ _id: req.user._id }, { $set: { accountType: 'business' } });
    res.json({ ok: true, accountType: 'business' });
  } catch (err) {
    console.error('Account switch failed:', err.message);
    res.status(500).json({ error: 'Could not switch account.' });
  }
});

// Profile fields shared by both business and customer accounts.
app.post('/api/me/profile', requireUser, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const b = req.body || {};
    const username = String(b.username || '').trim().slice(0, 30);
    const realName = String(b.realName || '').trim().slice(0, 60);
    const bio = String(b.bio || '').trim().slice(0, 200);
    const avatarUrl = String(b.avatarUrl || '');
    if (avatarUrl.length > 2 * 1024 * 1024){
      return res.status(400).json({ error: 'That image is too large — please choose a smaller one.' });
    }
    await usersCol.updateOne({ _id: req.user._id }, { $set: { username, realName, bio, avatarUrl } });
    res.json({ ok: true, username, realName, bio, avatarUrl });
  } catch (err) {
    res.status(500).json({ error: 'Could not save profile.' });
  }
});

// ---------------- Premium payments (WiPay one-time + PayPal recurring) ----------------
const PREMIUM_WIPAY_PRICE_TTD = 75; // covers 3 months — adjust as needed
const PREMIUM_WIPAY_DAYS = 90;

app.post('/api/premium/wipay/start', requireUser, async (req, res) => {
  try {
    const orderId = 'PREM-' + req.user._id.toString() + '-' + Date.now();
    await usersCol.updateOne({ _id: req.user._id }, { $set: { wipayPending: { orderId, total: PREMIUM_WIPAY_PRICE_TTD, at: new Date() } } });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    // Best-effort based on WiPay's documented hosted-checkout flow — exact field names
    // may need a small adjustment once tested against real WiPay sandbox credentials.
    const params = new URLSearchParams({
      account_number: process.env.WIPAY_ACCOUNT_NUMBER || '',
      api_key: process.env.WIPAY_API_KEY || '',
      total: PREMIUM_WIPAY_PRICE_TTD.toFixed(2),
      order_id: orderId,
      currency: 'TTD',
      country_code: 'TT',
      method: 'credit_card',
      response_url: `${baseUrl}/api/premium/wipay/return`,
      origin: req.get('host').replace(/[^a-zA-Z0-9_-]/g, '-')
    });
    res.json({ checkoutUrl: `https://tt.wipayfinancial.com/plugins/payments/request?${params.toString()}` });
  } catch (err) {
    console.error('WiPay start failed:', err.message);
    res.status(500).json({ error: 'Could not start WiPay checkout.' });
  }
});

// WiPay sends the customer back here after paying. Anyone can open this URL, so we only
// upgrade when the response carries a valid signature from WiPay (hash = md5 of
// transaction_id + total + our API key, as described in WiPay's docs) AND matches an
// order this user really started. IMPORTANT: confirm this against WiPay's sandbox before
// relying on it — if the signature format differs, upgrades are refused (safe), not granted.
app.get('/api/premium/wipay/return', async (req, res) => {
  const { order_id, status, transaction_id, total, hash } = req.query;
  let ok = false;
  try {
    const apiKey = process.env.WIPAY_API_KEY || '';
    if (status === 'success' && order_id && transaction_id && total && hash && apiKey && usersCol){
      const expected = crypto.createHash('md5').update(String(transaction_id) + String(total) + apiKey).digest('hex');
      const a = Buffer.from(String(hash).toLowerCase()), b = Buffer.from(expected);
      const signed = a.length === b.length && crypto.timingSafeEqual(a, b);
      const userId = String(order_id).split('-')[1];
      const user = signed && await usersCol.findOne({ _id: new ObjectId(userId) });
      const pending = user && user.wipayPending;
      if (pending && pending.orderId === String(order_id) && Number(total) === Number(pending.total)){
        const expires = new Date(Date.now() + PREMIUM_WIPAY_DAYS * 24 * 60 * 60 * 1000);
        await usersCol.updateOne({ _id: user._id }, { $set: { plan: 'premium', premiumMethod: 'wipay', premiumExpiresAt: expires }, $unset: { wipayPending: '' } });
        ok = true;
      } else {
        console.log('WiPay return refused: signature or order did not match for', order_id);
      }
    } else {
      console.log('WiPay return ignored: missing or unsigned details for', order_id);
    }
  } catch (err) {
    console.error('WiPay confirm failed:', err.message);
  }
  res.redirect('/account.html?premium=' + (ok ? 'success' : 'failed'));
});

app.get('/api/paypal/config', (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || '', planId: process.env.PAYPAL_PLAN_ID || '' });
});

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function paypalAccessToken(){
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString('base64');
  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await resp.json();
  return data.access_token;
}

// Handles PayPal's webhook notifications (cancellations, expirations, renewals).
// The message itself is never trusted: we only use it as a nudge, then ask PayPal directly
// for the subscription's real status, so a faked message can't change anyone's plan.
app.post('/api/paypal/webhook', async (req, res) => {
  res.sendStatus(200); // acknowledge quickly, PayPal expects a fast response
  try {
    const eventType = String((req.body && req.body.event_type) || '');
    const subscriptionId = req.body && req.body.resource && req.body.resource.id;
    if (!eventType.startsWith('BILLING.SUBSCRIPTION.') || !subscriptionId || !usersCol) return;
    const token = await paypalAccessToken();
    const resp = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${encodeURIComponent(String(subscriptionId))}`, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!resp.ok) return;
    const sub = await resp.json();
    if (sub.status === 'ACTIVE'){
      await usersCol.updateOne({ paypalSubscriptionId: subscriptionId }, { $set: { plan: 'premium', premiumMethod: 'paypal', premiumExpiresAt: null } });
    } else if (['CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(sub.status)){
      await usersCol.updateOne({ paypalSubscriptionId: subscriptionId }, { $set: { plan: 'free' } });
    }
    console.log('PayPal webhook handled:', subscriptionId, eventType, '->', sub.status);
  } catch (err) {
    console.error('PayPal webhook handling failed:', err.message);
  }
});

app.post('/api/premium/paypal/confirm', requireUser, async (req, res) => {
  try {
    const subscriptionId = String((req.body && req.body.subscriptionId) || '').slice(0, 100);
    if (!subscriptionId) return res.status(400).json({ error: 'Missing subscription ID.' });
    const token = await paypalAccessToken();
    const resp = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) return res.status(400).json({ error: 'Could not find that subscription.' });
    const sub = await resp.json();
    if (sub.status !== 'ACTIVE') return res.status(400).json({ error: 'Subscription is not active yet.' });
    if (process.env.PAYPAL_PLAN_ID && sub.plan_id !== process.env.PAYPAL_PLAN_ID) return res.status(400).json({ error: 'That subscription is for a different plan.' });
    const taken = await usersCol.findOne({ paypalSubscriptionId: subscriptionId, _id: { $ne: req.user._id } });
    if (taken) return res.status(400).json({ error: 'That subscription is already linked to another account.' });
    await usersCol.updateOne(
      { _id: req.user._id },
      { $set: { plan: 'premium', premiumMethod: 'paypal', paypalSubscriptionId: subscriptionId, premiumExpiresAt: null } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PayPal confirm failed:', err.message);
    res.status(500).json({ error: 'Could not confirm subscription.' });
  }
});

// Strips staff credentials before sending a business doc to the browser.
function publicBiz(biz){
  if (!biz) return biz;
  const out = { ...biz };
  if (Array.isArray(out.staff)){
    out.staff = out.staff.map(s => ({ _id: s._id, email: s.email, permissions: s.permissions, createdAt: s.createdAt }));
  }
  return out;
}

// ---------------- Self-service business listings (signed-in owners) ----------------
app.get('/api/my/businesses', requireUser, async (req, res) => {
  if (!businessesCol) return res.json([]);
  try {
    const uid = req.user._id.toString();
    const list = await businessesCol.find({
      $or: [{ ownerId: uid }, { 'collaborators.userId': uid }]
    }).sort({ name: 1 }).toArray();
    const ownerIds = [...new Set(list.map(b => b.ownerId).filter(Boolean))];
    const owners = ownerIds.length ? await usersCol.find({ _id: { $in: ownerIds.map(i => new ObjectId(i)) } }).toArray() : [];
    const planOf = {}; owners.forEach(o => { planOf[o._id.toString()] = effectivePlan(o); });
    res.json(list.map(biz => ({ ...publicBiz(biz), isOwner: biz.ownerId === uid, photoLimit: PHOTO_LIMIT[planOf[biz.ownerId] || 'free'] })));
  } catch (err) {
    res.json([]);
  }
});

const BUSINESS_LIMIT = { free: 1, premium: 3 };


// ---------------- Customer photo uploads (Photos page) ----------------
app.get('/api/businesses/:id/photos', async (req, res) => {
  if (!photosCol) return res.json([]);
  try {
    const list = await photosCol.find({ bizId: req.params.id }).sort({ createdAt: -1 }).limit(60).toArray();
    res.json(list.map(p => ({ _id: p._id.toString(), url: p.url, username: p.username || '', userId: p.userId, createdAt: p.createdAt })));
  } catch (err) { res.json([]); }
});

app.post('/api/businesses/:id/photos', requireUser, requireVerified, async (req, res) => {
  if (!photosCol || !businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const url = String((req.body && req.body.url) || '');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url)) return res.status(400).json({ error: 'Please choose a photo.' });
    if (url.length > 450000) return res.status(400).json({ error: 'That photo is too big. Try a smaller one.' });
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) }, { projection: { _id: 1 } });
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await photosCol.countDocuments({ bizId: req.params.id, userId: req.user._id.toString(), createdAt: { $gte: since } });
    if (recent >= 5) return res.status(429).json({ error: 'You can add up to 5 photos per day for each business.' });
    const total = await photosCol.countDocuments({ bizId: req.params.id });
    if (total >= 200) return res.status(400).json({ error: 'This page has reached its photo limit.' });
    const doc = { bizId: req.params.id, userId: req.user._id.toString(), username: String(req.user.username || '').slice(0, 60), url, createdAt: new Date() };
    const r = await photosCol.insertOne(doc);
    res.json({ photo: { _id: r.insertedId.toString(), url, username: doc.username, userId: doc.userId, createdAt: doc.createdAt } });
  } catch (err) { res.status(400).json({ error: 'Could not add your photo.' }); }
});

app.delete('/api/businesses/:id/photos/:photoId', requireUser, async (req, res) => {
  if (!photosCol || !businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const photo = await photosCol.findOne({ _id: new ObjectId(req.params.photoId), bizId: req.params.id });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) }, { projection: { ownerId: 1 } });
    const me = req.user._id.toString();
    if (photo.userId !== me && !(biz && biz.ownerId === me)) return res.status(403).json({ error: 'Not allowed' });
    await photosCol.deleteOne({ _id: photo._id });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not remove photo.' }); }
});

const TEMPLATES = ['food', 'fabric', 'beauty', 'build'];
app.post('/api/my/businesses', requireUser, requireVerified, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const ownedCount = await businessesCol.countDocuments({ ownerId: req.user._id.toString() });
    const limit = BUSINESS_LIMIT[req.user.plan === 'premium' ? 'premium' : 'free'];
    if (ownedCount >= limit){
      return res.status(403).json({
        error: req.user.plan === 'premium'
          ? `Premium accounts can own up to ${limit} businesses.`
          : `Free accounts can own ${limit} business. Upgrade to Premium to own up to ${BUSINESS_LIMIT.premium}.`
      });
    }
    const b = req.body || {};
    const photoErr = photoLimitError(b, effectivePlan(req.user), null);
    if (photoErr) return res.status(403).json({ error: photoErr });
    const doc = {
      ownerId: req.user._id.toString(),
      name: String(b.name || '').slice(0, 100),
      category: String(b.category || 'Food').slice(0, 40),
      area: String(b.area || 'Port of Spain').slice(0, 60),
      description: String(b.description || '').slice(0, 500),
      address: String(b.address || '').slice(0, 200),
      phone: String(b.phone || '').slice(0, 40),
      email: String(b.email || '').slice(0, 150),
      hours: sanitizeHours(b.hours),
      imageUrl: String(b.imageUrl || '').slice(0, 400000),
      photos: sanitizePhotoArray(b.photos),
      menuPhotos: sanitizePhotoArray(b.menuPhotos),
      highlights: sanitizePhotoArray(b.highlights),
      template: TEMPLATES.includes(b.template) ? b.template : 'food',
      about: sanitizeAbout(b.about),
      social: sanitizeSocial(b.social),
      hiring: !!b.hiring,
      featured: false,
      deals: [],
      posts: [],
      jobs: [],
      collaborators: [],
      createdAt: new Date()
    };
    if (!doc.name.trim()) return res.status(400).json({ error: 'Business name is required.' });
    if (b.dealTitle){
      doc.deals.push({
        title: String(b.dealTitle).slice(0, 100),
        description: String(b.dealDescription || '').slice(0, 300),
        endDate: b.dealEndDate ? new Date(b.dealEndDate) : null
      });
    }
    const result = await businessesCol.insertOne(doc);
    const business = { ...doc, _id: result.insertedId };
    res.json({ ok: true, id: result.insertedId, business });
    notifyAreaCustomers(
      doc.area,
      `New business added in ${doc.area}: ${doc.name}`,
      () => `<p>A new business just joined TT Discover in <b>${doc.area}</b>:</p>
             <h3>${doc.name}</h3>
             <p>${doc.description || ''}</p>
             <p>Category: ${doc.category}</p>`
    );
    if (doc.deals.length){
      notifyAreaCustomers(
        doc.area,
        `New deal at ${doc.name}: ${doc.deals[0].title}`,
        () => `<p><b>${doc.name}</b> in ${doc.area} just posted a new deal:</p>
               <h3>${doc.deals[0].title}</h3>
               <p>${doc.deals[0].description || ''}</p>`
      );
    }
  } catch (err) {
    console.error('Add business failed:', err.message);
    res.status(500).json({ error: 'Could not add business.' });
  }
});

app.put('/api/my/businesses/:id', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only edit a business you own or collaborate on.' });
    }
    const b = req.body || {};
    const ownerUser = biz.ownerId === req.user._id.toString() ? req.user : await usersCol.findOne({ _id: new ObjectId(biz.ownerId) });
    const photoErr = photoLimitError(b, effectivePlan(ownerUser), biz);
    if (photoErr) return res.status(403).json({ error: photoErr });
    const update = {};
    if (typeof b.name === 'string') update.name = b.name.slice(0, 100);
    if (typeof b.category === 'string' && b.category) update.category = b.category.slice(0, 40);
    if (typeof b.description === 'string') update.description = b.description.slice(0, 500);
    if (typeof b.address === 'string') update.address = b.address.slice(0, 200);
    if (typeof b.area === 'string' && b.area) update.area = b.area.slice(0, 60);
    if (typeof b.phone === 'string') update.phone = b.phone.slice(0, 40);
    if (typeof b.email === 'string') update.email = b.email.slice(0, 150);
    if (b.hours) update.hours = sanitizeHours(b.hours);
    if (typeof b.imageUrl === 'string') update.imageUrl = b.imageUrl.slice(0, 400000);
    if (Array.isArray(b.photos)) update.photos = sanitizePhotoArray(b.photos);
    if (Array.isArray(b.menuPhotos)) update.menuPhotos = sanitizePhotoArray(b.menuPhotos);
    if (Array.isArray(b.highlights)) update.highlights = sanitizePhotoArray(b.highlights);
    if (typeof b.hiring === 'boolean') update.hiring = b.hiring;
    if (TEMPLATES.includes(b.template)) update.template = b.template;
    if (typeof b.tagline === 'string') update.tagline = b.tagline.trim().slice(0, 60);
    if (typeof b.logoUrl === 'string') update.logoUrl = b.logoUrl.slice(0, 400000);
    if (Array.isArray(b.highlightNames)) update.highlightNames = b.highlightNames.slice(0, 10).map(n => String(n || '').trim().slice(0, 40));
    if (Array.isArray(b.menuItems)){
      update.menuItems = b.menuItems.slice(0, 80).map(i => ({
        name: String((i && i.name) || '').trim().slice(0, 60),
        price: String((i && i.price) || '').trim().slice(0, 20),
        section: String((i && i.section) || '').trim().slice(0, 30)
      })).filter(i => i.name);
    }
    if (b.about) update.about = sanitizeAbout(b.about);
    if (b.social) update.social = sanitizeSocial(b.social);
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update.' });
    await businessesCol.updateOne({ _id: biz._id }, { $set: update });
    res.json({ ok: true, business: { ...biz, ...update } });
  } catch (err) {
    res.status(500).json({ error: 'Could not update business.' });
  }
});

app.delete('/api/my/businesses/:id', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz || biz.ownerId !== req.user._id.toString()){
      return res.status(403).json({ error: 'You can only delete your own listing.' });
    }
    await businessesCol.deleteOne({ _id: biz._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete business.' });
  }
});

app.patch('/api/my/businesses/:id/hiring', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only edit a business you own or collaborate on.' });
    }
    const hiring = !!(req.body && req.body.hiring);
    await businessesCol.updateOne({ _id: biz._id }, { $set: { hiring } });
    res.json({ ok: true, hiring });
  } catch (err) {
    res.status(500).json({ error: 'Could not update hiring status.' });
  }
});

app.post('/api/my/businesses/:id/posts', requireBizPermission('posts'), async (req, res) => {
  try {
    const biz = req.biz;
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: 'A post title is required.' });
    const post = {
      _id: new ObjectId(),
      title,
      content: String(b.content || '').slice(0, 1000),
      imageUrl: String(b.imageUrl || '').slice(0, 400000),
      createdAt: new Date()
    };
    await businessesCol.updateOne({ _id: biz._id }, { $push: { posts: { $each: [post], $position: 0 } } });
    res.json({ ok: true, post });
  } catch (err) {
    res.status(500).json({ error: 'Could not create post.' });
  }
});

app.delete('/api/my/businesses/:id/posts/:postId', requireBizPermission('posts'), async (req, res) => {
  try {
    await businessesCol.updateOne({ _id: req.biz._id }, { $pull: { posts: { _id: new ObjectId(req.params.postId) } } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete post.' });
  }
});


app.post('/api/my/businesses/:id/jobs', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only post jobs for a business you own or collaborate on.' });
    }
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: 'A job title is required.' });
    const job = {
      _id: new ObjectId(),
      title,
      description: String(b.description || '').slice(0, 1000),
      location: String(b.location || '').slice(0, 150),
      employmentType: String(b.employmentType || '').slice(0, 40),
      salary: String(b.salary || '').slice(0, 100),
      requirements: String(b.requirements || '').slice(0, 1000),
      closingDate: b.closingDate ? new Date(b.closingDate) : null,
      createdAt: new Date()
    };
    await businessesCol.updateOne({ _id: biz._id }, { $push: { jobs: { $each: [job], $position: 0 } } });
    res.json({ ok: true, job });
  } catch (err) {
    res.status(500).json({ error: 'Could not create job listing.' });
  }
});

app.delete('/api/my/businesses/:id/jobs/:jobId', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only edit a business you own or collaborate on.' });
    }
    await businessesCol.updateOne({ _id: biz._id }, { $pull: { jobs: { _id: new ObjectId(req.params.jobId) } } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete job listing.' });
  }
});

// Reviews are public — anyone can leave one, no account required.
app.post('/api/businesses/:id/reviews', requireUser, requireVerified, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    const b = req.body || {};
    const rating = Math.round(Number(b.rating));
    if (!rating || rating < 1 || rating > 5){
      return res.status(400).json({ error: 'A star rating from 1 to 5 is required.' });
    }
    const comment = String(b.comment || '').trim().slice(0, 1000);
    if (!comment) return res.status(400).json({ error: 'A comment is required.' });
    const review = {
      _id: new ObjectId(),
      authorName: String(req.user.username || '').trim().slice(0, 60) || 'Anonymous',
      authorId: req.user._id.toString(),
      rating,
      comment,
      createdAt: new Date(),
      reply: null
    };
    await businessesCol.updateOne({ _id: biz._id }, { $push: { reviews: { $each: [review], $position: 0 } } });
    res.json({ ok: true, review });
  } catch (err) {
    res.status(500).json({ error: 'Could not submit review.' });
  }
});

// Owner reply to a review on their own business — one reply per review.
app.post('/api/my/businesses/:id/reviews/:reviewId/reply', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only reply to reviews on a business you own or collaborate on.' });
    }
    const text = String((req.body || {}).text || '').trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: 'A reply message is required.' });
    const reply = { text, createdAt: new Date() };
    const result = await businessesCol.updateOne(
      { _id: biz._id, 'reviews._id': new ObjectId(req.params.reviewId) },
      { $set: { 'reviews.$.reply': reply } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: 'Review not found.' });
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(500).json({ error: 'Could not save reply.' });
  }
});

// Post a new deal on an existing business — emails customers who follow that area.
app.post('/api/my/businesses/:id/deals', requireBizPermission('deals'), async (req, res) => {
  try {
    const biz = req.biz;
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: 'A deal title is required.' });
    const deal = {
      _id: new ObjectId(),
      title,
      description: String(b.description || '').trim().slice(0, 300),
      endDate: b.endDate ? new Date(b.endDate) : null,
      createdAt: new Date()
    };
    await businessesCol.updateOne({ _id: biz._id }, { $push: { deals: { $each: [deal], $position: 0 } } });
    res.json({ ok: true, deal });
    notifyAreaCustomers(
      biz.area,
      `New deal at ${biz.name}: ${deal.title}`,
      () => `<p><b>${biz.name}</b> in ${biz.area} just posted a new deal:</p>
             <h3>${deal.title}</h3>
             <p>${deal.description || ''}</p>`
    );
  } catch (err) {
    res.status(500).json({ error: 'Could not post deal.' });
  }
});

app.delete('/api/my/businesses/:id/deals/:dealId', requireBizPermission('deals'), async (req, res) => {
  try {
    await businessesCol.updateOne({ _id: req.biz._id }, { $pull: { deals: { _id: new ObjectId(req.params.dealId) } } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete deal.' });
  }
});

// ---------------- Staff (owner manages, staff log in separately) ----------------
// Owner adds a staff member with a password they set and specific permissions.
app.post('/api/my/businesses/:id/staff', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only manage staff on a business you own or collaborate on.' });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase().slice(0, 150);
    const password = String(b.password || '');
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if ((biz.staff || []).some(s => s.email === email)){
      return res.status(400).json({ error: 'A staff member with that email already exists on this business.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const staffMember = {
      _id: new ObjectId(),
      email,
      passwordHash,
      permissions: { posts: !!b.posts, deals: !!b.deals },
      sessionToken: null,
      createdAt: new Date()
    };
    await businessesCol.updateOne({ _id: biz._id }, { $push: { staff: staffMember } });
    res.json({ ok: true, staff: { _id: staffMember._id, email, permissions: staffMember.permissions, createdAt: staffMember.createdAt } });
  } catch (err) {
    res.status(500).json({ error: 'Could not add staff member.' });
  }
});

app.delete('/api/my/businesses/:id/staff/:staffId', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!canManageBiz(biz, req.user._id.toString())){
      return res.status(403).json({ error: 'You can only manage staff on a business you own or collaborate on.' });
    }
    await businessesCol.updateOne({ _id: biz._id }, { $pull: { staff: { _id: new ObjectId(req.params.staffId) } } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove staff member.' });
  }
});

// ---------------- Collaborators (co-owners) — original owner only ----------------
// A collaborator gets the same day-to-day access as the owner (edit info,
// posts, jobs, deals, staff, review replies) but can't delete the business
// or manage the collaborator list themselves — only the original owner can.
// The owner sends an invitation. The other person gets an email with Accept / Cancel buttons and
// is only added once they accept, so nobody is added without knowing.
const INVITE_DAYS = 7;
app.post('/api/my/businesses/:id/collaborators', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol || !usersCol || !invitesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz || biz.ownerId !== req.user._id.toString()){
      return res.status(403).json({ error: 'Only the original owner can manage collaborators.' });
    }
    if (!rateCheck('invite:' + req.user._id.toString(), 10, 60 * 60 * 1000)) return res.status(429).json({ error: 'You have sent a lot of invitations. Please try again in a little while.' });
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required.' });
    const found = await usersCol.findOne({ email, accountType: 'business' });
    if (!found) return res.status(404).json({ error: 'No business account found with that email. They need a TT Discover business account first.' });
    const foundId = found._id.toString();
    if (foundId === biz.ownerId) return res.status(400).json({ error: "That's already the owner." });
    if ((biz.collaborators || []).some(c => c.userId === foundId)){
      return res.status(400).json({ error: 'That person is already a collaborator.' });
    }
    // One open invitation per person per business: sending again replaces the old one.
    await invitesCol.deleteMany({ bizId: biz._id.toString(), inviteeId: foundId, status: 'pending' });
    const raw = crypto.randomBytes(24).toString('hex');
    await invitesCol.insertOne({
      bizId: biz._id.toString(), bizName: biz.name, inviterId: biz.ownerId, inviterEmail: req.user.email,
      inviteeId: foundId, inviteeEmail: found.email, tokenHash: sha256(raw), status: 'pending',
      createdAt: new Date(), expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000)
    });
    const link = `${siteUrl(req)}/invite.html?token=${raw}`;
    const btn = 'display:inline-block;padding:12px 26px;border-radius:24px;font-weight:700;text-decoration:none;font-size:15px;';
    sendMail(found.email, `${biz.name} invited you to help manage their page on TT Discover`,
      `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;">
         <h2 style="margin:0 0 10px;">You've been invited 🎉</h2>
         <p><b>${escapeHtml(req.user.email)}</b> would like you to help manage <b>${escapeHtml(biz.name)}</b> on TT Discover.</p>
         <p>As a collaborator you can edit the business info, photos, hours, posts, jobs and deals using your own account. Only the owner can delete the business or change collaborators.</p>
         <p style="margin:22px 0;">
           <a href="${link}&a=accept" style="${btn}background:#e0562f;color:#ffffff;">Accept</a>
           &nbsp;
           <a href="${link}&a=decline" style="${btn}background:#eeeeee;color:#333333;">Cancel</a>
         </p>
         <p style="font-size:13px;color:#777;">This invitation works for ${INVITE_DAYS} days. If you don't know this person, just ignore this email.</p>
       </div>`);
    res.json({ ok: true, pending: true, emailSent: !!mailTransporter });
  } catch (err) {
    console.error('Invite failed:', err.message);
    res.status(500).json({ error: 'Could not send the invitation.' });
  }
});

app.get('/api/my/businesses/:id/invites', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol || !invitesCol) return res.json([]);
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz || biz.ownerId !== req.user._id.toString()) return res.status(403).json({ error: 'Only the original owner can manage collaborators.' });
    const list = await invitesCol.find({ bizId: biz._id.toString(), status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
    res.json(list.map(i => ({ _id: i._id.toString(), email: i.inviteeEmail, createdAt: i.createdAt, expiresAt: i.expiresAt })));
  } catch (err) { res.json([]); }
});

app.delete('/api/my/businesses/:id/invites/:inviteId', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol || !invitesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz || biz.ownerId !== req.user._id.toString()) return res.status(403).json({ error: 'Only the original owner can manage collaborators.' });
    await invitesCol.deleteOne({ _id: new ObjectId(req.params.inviteId), bizId: biz._id.toString(), status: 'pending' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not cancel the invitation.' }); }
});

// Public: the invitation page (opened from the email). The secret token in the link is the proof.
app.get('/api/collab-invite/:token', async (req, res) => {
  if (!invitesCol) return res.status(503).json({ error: 'Not available right now.' });
  if (!rateCheck('invget:' + req.ip, 60, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a bit.' });
  try {
    const inv = await invitesCol.findOne({ tokenHash: sha256(req.params.token) });
    if (!inv) return res.status(404).json({ error: 'This invitation link is not valid.' });
    const status = inv.status === 'pending' && inv.expiresAt < new Date() ? 'expired' : inv.status;
    res.json({ bizName: inv.bizName, inviterEmail: inv.inviterEmail, inviteeEmail: inv.inviteeEmail, status });
  } catch (err) { res.status(404).json({ error: 'This invitation link is not valid.' }); }
});

app.post('/api/collab-invite/:token/respond', async (req, res) => {
  if (!invitesCol || !businessesCol || !usersCol) return res.status(503).json({ error: 'Not available right now.' });
  if (!rateCheck('invpost:' + req.ip, 30, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many tries. Please wait a bit.' });
  try {
    const action = (req.body || {}).action === 'accept' ? 'accept' : (req.body || {}).action === 'decline' ? 'decline' : '';
    if (!action) return res.status(400).json({ error: 'Choose Accept or Cancel.' });
    const inv = await invitesCol.findOne({ tokenHash: sha256(req.params.token) });
    if (!inv) return res.status(404).json({ error: 'This invitation link is not valid.' });
    if (inv.status !== 'pending') return res.status(400).json({ error: inv.status === 'accepted' ? 'You already accepted this invitation.' : 'This invitation was already answered or cancelled.' });
    if (inv.expiresAt < new Date()) return res.status(400).json({ error: 'This invitation has expired. Ask the owner to send a new one.' });

    if (action === 'accept'){
      const user = await usersCol.findOne({ _id: new ObjectId(inv.inviteeId) });
      if (!user || user.accountType !== 'business') return res.status(400).json({ error: 'Your account needs to be a business account first. Switch it in Settings, then open this link again.' });
      const biz = await businessesCol.findOne({ _id: new ObjectId(inv.bizId) });
      if (!biz) return res.status(404).json({ error: 'That business no longer exists.' });
      const claimed = await invitesCol.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'accepted', answeredAt: new Date() } });
      if (!claimed.modifiedCount) return res.status(400).json({ error: 'This invitation was already answered.' });
      if (!(biz.collaborators || []).some(c => c.userId === inv.inviteeId)){
        await businessesCol.updateOne({ _id: biz._id }, { $push: { collaborators: { userId: inv.inviteeId, email: inv.inviteeEmail, addedAt: new Date() } } });
      }
    } else {
      const claimed = await invitesCol.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'declined', answeredAt: new Date() } });
      if (!claimed.modifiedCount) return res.status(400).json({ error: 'This invitation was already answered.' });
    }
    // Let the owner know what happened.
    sendMail(inv.inviterEmail, `${inv.inviteeEmail} ${action === 'accept' ? 'accepted' : 'declined'} your invitation`,
      `<p><b>${escapeHtml(inv.inviteeEmail)}</b> ${action === 'accept' ? 'accepted your invitation and can now help manage' : 'declined your invitation to help manage'} <b>${escapeHtml(inv.bizName)}</b>.</p>`);
    res.json({ ok: true, action, bizName: inv.bizName });
  } catch (err) {
    console.error('Invite response failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.delete('/api/my/businesses/:id/collaborators/:userId', requireUser, requireBusinessAccount, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!biz || biz.ownerId !== req.user._id.toString()){
      return res.status(403).json({ error: 'Only the original owner can manage collaborators.' });
    }
    await businessesCol.updateOne({ _id: biz._id }, { $pull: { collaborators: { userId: req.params.userId } } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove collaborator.' });
  }
});

// Staff sign in with the email/password their employer set for them.
app.post('/api/staff/login', async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const ipKey = 'staff-ip:' + req.ip, emailKey = 'staff:' + email;
    if (rateBlocked(ipKey, 30) || rateBlocked(emailKey, 8)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' });
    const biz = await businessesCol.findOne({ 'staff.email': email });
    const staffMember = biz && (biz.staff || []).find(s => s.email === email);
    const ok = staffMember && await bcrypt.compare(password, staffMember.passwordHash);
    if (!ok){
      rateCheck(ipKey, 30, 15 * 60 * 1000); rateCheck(emailKey, 8, 15 * 60 * 1000);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    rateClear(emailKey);
    const sessionToken = crypto.randomBytes(24).toString('hex');
    await businessesCol.updateOne(
      { _id: biz._id, 'staff._id': staffMember._id },
      { $set: { 'staff.$.sessionToken': sessionToken } }
    );
    res.json({
      token: sessionToken,
      businessId: biz._id,
      businessName: biz.name,
      permissions: staffMember.permissions
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not sign in.' });
  }
});

app.get('/api/staff/me', async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  const token = req.headers['x-staff-token'];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const biz = await businessesCol.findOne({ 'staff.sessionToken': token });
    if (!biz) return res.status(401).json({ error: 'Not signed in.' });
    const staffMember = (biz.staff || []).find(s => s.sessionToken === token);
    res.json({
      businessId: biz._id,
      businessName: biz.name,
      email: staffMember.email,
      permissions: staffMember.permissions
    });
  } catch (err) {
    res.status(401).json({ error: 'Not signed in.' });
  }
});

app.post('/api/staff/logout', async (req, res) => {
  if (!businessesCol) return res.json({ ok: true });
  const token = req.headers['x-staff-token'];
  if (token){
    await businessesCol.updateOne({ 'staff.sessionToken': token }, { $set: { 'staff.$.sessionToken': null } }).catch(() => {});
  }
  res.json({ ok: true });
});

// ---------------- Admin API (password protected) ----------------

// ---------------- Reports (reviews, photos, businesses) ----------------
const REPORT_REASONS = ['Spam or fake', 'Offensive or inappropriate', 'Wrong or misleading information', 'Other'];
app.post('/api/reports', requireUser, async (req, res) => {
  if (!reportsCol || !businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const b = req.body || {};
    const type = ['review', 'photo', 'business'].includes(b.type) ? b.type : '';
    const bizId = String(b.bizId || '');
    const targetId = type === 'business' ? bizId : String(b.targetId || '');
    if (!type || !bizId || !targetId) return res.status(400).json({ error: 'Nothing to report.' });
    const reporterId = req.user._id.toString();
    if (!rateCheck('report:' + reporterId, 20, 24 * 60 * 60 * 1000)) return res.status(429).json({ error: 'You have sent a lot of reports today. Please try again tomorrow.' });
    const biz = await businessesCol.findOne({ _id: new ObjectId(bizId) }, { projection: { name: 1, reviews: 1 } });
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    if (type === 'review' && !(biz.reviews || []).some(r => String(r._id) === targetId)) return res.status(404).json({ error: 'Review not found.' });
    if (type === 'photo' && !(photosCol && await photosCol.findOne({ _id: new ObjectId(targetId), bizId }))) return res.status(404).json({ error: 'Photo not found.' });
    const already = await reportsCol.findOne({ reporterId, type, bizId, targetId, status: 'open' });
    if (!already){
      const reason = REPORT_REASONS.includes(b.reason) ? b.reason : 'Other';
      await reportsCol.insertOne({ type, bizId, targetId, reason, details: String(b.details || '').trim().slice(0, 500), reporterId, reporterEmail: req.user.email, status: 'open', createdAt: new Date() });
      if (process.env.ADMIN_EMAIL) sendMail(process.env.ADMIN_EMAIL, 'New report on TT Discover', `<p>A ${type} on <b>${escapeHtml(biz.name)}</b> was reported: ${escapeHtml(reason)}.</p><p>Open the admin page to review it.</p>`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Could not send your report.' });
  }
});

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  if (!reportsCol) return res.json([]);
  try {
    const list = await reportsCol.find({ status: 'open' }).sort({ createdAt: -1 }).limit(100).toArray();
    const out = [];
    for (const r of list){
      const item = { _id: r._id.toString(), type: r.type, bizId: r.bizId, reason: r.reason, details: r.details, reporterEmail: r.reporterEmail, createdAt: r.createdAt, bizName: '', preview: '', imageUrl: '', gone: false };
      try {
        const biz = await businessesCol.findOne({ _id: new ObjectId(r.bizId) }, { projection: { name: 1, reviews: 1 } });
        item.bizName = biz ? biz.name : '';
        if (!biz) item.gone = true;
        else if (r.type === 'review'){
          const rev = (biz.reviews || []).find(x => String(x._id) === r.targetId);
          if (rev) item.preview = `${rev.authorName} (${rev.rating}★): ${rev.comment}`; else item.gone = true;
        } else if (r.type === 'photo'){
          const ph = await photosCol.findOne({ _id: new ObjectId(r.targetId) });
          if (ph){ item.imageUrl = ph.url; item.preview = 'Photo by @' + (ph.username || 'customer'); } else item.gone = true;
        }
      } catch (e) { item.gone = true; }
      out.push(item);
    }
    res.json(out);
  } catch (err) { res.json([]); }
});

app.post('/api/admin/reports/:id/dismiss', requireAdmin, async (req, res) => {
  try {
    await reportsCol.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: 'dismissed', closedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not update report.' }); }
});

app.post('/api/admin/reports/:id/remove', requireAdmin, async (req, res) => {
  try {
    const r = await reportsCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!r) return res.status(404).json({ error: 'Report not found.' });
    if (r.type === 'review') await businessesCol.updateOne({ _id: new ObjectId(r.bizId) }, { $pull: { reviews: { _id: new ObjectId(r.targetId) } } });
    else if (r.type === 'photo') await photosCol.deleteOne({ _id: new ObjectId(r.targetId) });
    else return res.status(400).json({ error: 'To remove a business, delete it from the listings list.' });
    await reportsCol.updateMany({ type: r.type, bizId: r.bizId, targetId: r.targetId, status: 'open' }, { $set: { status: 'removed', closedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not remove that.' }); }
});

app.post('/api/admin/check', requireAdmin, (req, res) => { res.json({ ok: true }); });

app.post('/api/admin/businesses', requireAdmin, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const b = req.body || {};
    const doc = {
      name: String(b.name || '').slice(0, 100),
      category: String(b.category || 'Food').slice(0, 40),
      area: String(b.area || 'Port of Spain').slice(0, 60),
      description: String(b.description || '').slice(0, 500),
      address: String(b.address || '').slice(0, 200),
      phone: String(b.phone || '').slice(0, 40),
      hours: sanitizeHours(b.hours),
      imageUrl: String(b.imageUrl || '').slice(0, 500),
      featured: !!b.featured,
      deals: [],
      createdAt: new Date()
    };
    if (b.dealTitle){
      doc.deals.push({
        title: String(b.dealTitle).slice(0, 100),
        description: String(b.dealDescription || '').slice(0, 300),
        endDate: b.dealEndDate ? new Date(b.dealEndDate) : null
      });
    }
    const result = await businessesCol.insertOne(doc);
    res.json({ ok: true, id: result.insertedId });
  } catch (err) {
    console.error('Add business failed:', err.message);
    res.status(500).json({ error: 'Could not add business' });
  }
});

app.delete('/api/admin/businesses/:id', requireAdmin, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    await businessesCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete business' });
  }
});

app.patch('/api/admin/businesses/:id/featured', requireAdmin, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    await businessesCol.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { featured: !!(req.body && req.body.featured) } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not update business' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('TT Local Platform running on port ' + PORT));

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId, BSON } = require('mongodb');

const app = express();
app.set('trust proxy', 1); // so req.ip is the real visitor on Render
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false })); // '/' is served below so the share preview can be filled in

// ---------------- Email notifications ----------------
// Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Works with Gmail, SendGrid/Mailgun SMTP relay, or any standard SMTP provider.
// Until these are set, emails are just logged to the console instead of sent —
// nothing breaks, this just quietly does nothing until credentials are added.
let mailTransporter = null;
// Preferred: send through Brevo's web API (works on Render's free plan, which blocks the normal SMTP ports).
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS){
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
// True when the site has some way to send email (web API or SMTP).
const mailEnabled = !!(BREVO_API_KEY || mailTransporter);
if (!mailEnabled){
  console.log('Email notifications: BREVO_API_KEY (or SMTP_HOST/SMTP_USER/SMTP_PASS) not set — emails will be logged, not sent.');
} else {
  console.log('Email notifications: ' + (BREVO_API_KEY ? 'sending through the Brevo web API.' : 'sending through SMTP.'));
}

const MAIL_FROM = process.env.SMTP_FROM || 'TT Discover <notifications@ttdiscover.example>';

// "TT Discover <me@example.com>"  ->  { name, email }
function parseFrom(str){
  const m = String(str).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || 'TT Discover', email: m[2].trim() };
  return { name: 'TT Discover', email: String(str).trim() };
}

// Plain-text copy of an email (mail programs and spam filters like emails that have one).
function htmlToText(html){
  return String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      const t = label.replace(/<[^>]+>/g, '').trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// opts: { headers: {name: value}, attachments: [{ name, content (base64) }] }
async function sendMail(to, subject, html, replyTo, opts){
  opts = opts || {};
  if (!mailEnabled){
    const links = (String(html).match(/href="([^"]+)"/g) || []).map(h => h.slice(6, -1));
    console.log(`[email not sent — email not set up] To: ${to} | Subject: ${subject}${links.length ? ' | Link: ' + links.join(' ') : ''}`);
    return;
  }
  const text = htmlToText(html);
  try {
    if (BREVO_API_KEY){
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const send = withHeaders => fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: parseFrom(MAIL_FROM), to: [{ email: to }], subject, htmlContent: html, textContent: text,
            ...(replyTo ? { replyTo: { email: replyTo } } : {}),
            ...(withHeaders && opts.headers ? { headers: opts.headers } : {}),
            ...(opts.attachments ? { attachment: opts.attachments } : {})
          }),
          signal: ctrl.signal
        });
        let r = await send(true);
        if (r.status === 400 && opts.headers) r = await send(false);   // if Brevo refuses the extra headers, still send the email
        if (!r.ok){
          const detail = await r.text().catch(() => '');
          throw new Error(`Brevo said ${r.status}: ${detail.slice(0, 300)}`);
        }
      } finally { clearTimeout(timer); }
    } else {
      await mailTransporter.sendMail({
        from: MAIL_FROM, to, subject, html, text,
        ...(replyTo ? { replyTo } : {}),
        ...(opts.headers ? { headers: opts.headers } : {}),
        ...(opts.attachments ? { attachments: opts.attachments.map(a => ({ filename: a.name, content: Buffer.from(a.content, 'base64') })) } : {})
      });
    }
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
  }
}

// ---------------- Unsubscribe links for area update emails ----------------
// A link in each update email lets a customer stop them without logging in. The link is signed so it cannot be guessed.
const MAIL_SECRET = process.env.MAIL_SECRET || crypto.createHash('sha256').update('mail:' + (process.env.ADMIN_PASSWORD || '') + (process.env.MONGODB_URI || '')).digest('hex');
const unsubToken = userId => crypto.createHmac('sha256', MAIL_SECRET).update('unsub:' + String(userId)).digest('hex').slice(0, 32);
function validUnsub(u, t){
  try {
    const a = Buffer.from(unsubToken(u)), b = Buffer.from(String(t || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
const publicBase = () => String(process.env.SITE_URL || '').replace(/\/+$/, '');
const bizLink = id => publicBase() ? `<p><a href="${publicBase()}/biz/${id}">See it on TT Discover</a></p>` : '';

// Notifies every customer account whose chosen area matches, one email each.
// A failed send for one customer never blocks the others.
async function notifyAreaCustomers(area, subject, buildHtml){
  if (!usersCol || !area) return;
  try {
    const customers = await usersCol.find({ accountType: 'customer', preferredArea: area }).toArray();
    const base = publicBase();
    await Promise.all(customers.map(c => {
      let html = buildHtml(c), opts;
      if (base){
        const link = `${base}/unsubscribe?u=${c._id.toString()}&t=${unsubToken(c._id.toString())}`;
        html += `<p style="font-size:12px;color:#777;margin-top:24px;">You get this because you asked TT Discover for updates about ${escapeHtml(area)}. <a href="${link}">Stop these emails</a></p>`;
        opts = { headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
      }
      return sendMail(c.email, subject, html, undefined, opts);
    }));
  } catch (err) {
    console.error('notifyAreaCustomers failed:', err.message);
  }
}

// ---------------- Image storage ----------------
// Photos arrive from the browser as small compressed data URLs. We save the picture itself once, in its own
// "images" collection, and keep only a short link like /img/<id> on the business, user or post.
// The same picture is never saved twice (matched by a fingerprint), and /img/<id> is cached by browsers.
const IMG_DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const IMG_MAX_BYTES = 1.5 * 1024 * 1024;
const isDataImage = v => typeof v === 'string' && v.startsWith('data:image/');
async function storeImage(value){
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\/img\/[a-f0-9]{24}$/.test(s)) return s;           // already stored
  if (!s.startsWith('data:')) return s.slice(0, 2000);       // an ordinary link: keep as is
  const m = IMG_DATA_RE.exec(s);
  if (!m || !imagesCol) return '';
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > IMG_MAX_BYTES) return '';
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const found = await imagesCol.findOne({ hash }, { projection: { _id: 1 } });
  if (found) return '/img/' + found._id.toString();
  const r = await imagesCol.insertOne({ hash, type: 'image/' + m[1], data: buf, size: buf.length, createdAt: new Date() });
  return '/img/' + r.insertedId.toString();
}

// Photo arrays for the business's own gallery, menu photos and highlights.
// How many each group may hold depends on the owner's plan (customer photos on the Photos page are separate and not limited by this).
const PHOTO_LIMIT = { free: 5, premium: 20 };
async function sanitizePhotoArray(arr){
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const u of arr.slice(0, PHOTO_LIMIT.premium)){
    const stored = await storeImage(u);
    if (stored) out.push(stored);
  }
  return out;
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
  if (mailEnabled && req.user && req.user.emailVerified === false){
    return res.status(403).json({ error: 'Please confirm your email first. Check your inbox (and spam) for our message.', needsVerification: true });
  }
  next();
}

let businessesCol = null;
let usersCol = null;
let photosCol = null;
let invitesCol = null;
let reportsCol = null;
let imagesCol = null;
let dbHandle = null;

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
    imagesCol = db.collection('images');
    dbHandle = db;
    imagesCol.createIndex({ hash: 1 }).catch(() => {});
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
    if (user.banned){
      const path = String(req.originalUrl || '').split('?')[0];
      const allowed = (req.method === 'GET' && path === '/api/me') || (req.method === 'POST' && path === '/api/me/appeal');
      if (!allowed) return res.status(403).json({ banned: true, error: 'Your account has been suspended. Sign in at the Business Studio page to read why and send us a note.' });
    }
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
      if (user && user.banned) return res.status(403).json({ banned: true, error: 'Your account has been suspended.' });
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
          { description: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
          { area: { $regex: q, $options: 'i' } }
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

// Tiny page for an outside timer to visit so the free Render plan wakes up and stays awake.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serves a stored picture. The link never changes for a picture, so browsers may keep it for a year.
app.get('/img/:id', async (req, res) => {
  if (!imagesCol) return res.status(404).end();
  try {
    const doc = await imagesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc || !doc.data) return res.status(404).end();
    const buf = Buffer.from(doc.data.buffer);
    res.set({ 'Content-Type': doc.type || 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  } catch (err) { res.status(404).end(); }
});

// ---------------- Backups (Admin page) ----------------
// Streams the whole database as a text file, one record per line, so it never has to fit in memory.
//   part=data   -> everything except the pictures (small)
//   part=photos -> only the pictures (bigger)
// Keep these files private: the data file includes accounts and scrambled passwords.
app.get('/api/admin/backup', requireAdmin, async (req, res) => {
  if (!dbHandle) return res.status(503).json({ error: 'Database not connected' });
  const part = req.query.part === 'photos' ? 'photos' : 'data';
  try {
    const names = (await dbHandle.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name)
      .filter(n => !n.startsWith('system.') && (part === 'photos' ? n === 'images' : n !== 'images'));
    const day = new Date().toISOString().slice(0, 10);
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="tt-discover-${part}-${day}.ndjson"`, 'Cache-Control': 'no-store' });
    let count = 0;
    for (const name of names){
      for await (const doc of dbHandle.collection(name).find({})){
        const line = JSON.stringify({ c: name, d: BSON.EJSON.stringify(doc, { relaxed: false }) }) + '\n';
        if (!res.write(line)) await new Promise(r => res.once('drain', r));
        count++;
      }
    }
    res.end();
    dbHandle.collection('meta').updateOne({ _id: 'backup' }, { $set: { ['last_' + part]: new Date(), ['count_' + part]: count } }, { upsert: true }).catch(() => {});
  } catch (err) {
    console.error('Backup failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed.' }); else res.destroy();
  }
});
app.get('/api/admin/backup/status', requireAdmin, async (req, res) => {
  if (!dbHandle) return res.json({});
  try {
    const m = await dbHandle.collection('meta').findOne({ _id: 'backup' });
    res.json({ data: (m && m.last_data) || null, photos: (m && m.last_photos) || null });
  } catch (err) { res.json({}); }
});

// Unsubscribe from area update emails. The page only shows a button (so mail scanners that open links
// cannot unsubscribe people by accident); the POST does the work and is also what mail apps' one-tap unsubscribe uses.
app.get('/unsubscribe', (req, res) => {
  const u = String(req.query.u || ''), t = String(req.query.t || '');
  const ok = validUnsub(u, t);
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Stop emails — TT Discover</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#fdf6ec;color:#2a2a2a;margin:0;"><div style="max-width:420px;margin:60px auto;padding:0 20px;text-align:center;">
${ok ? `<h2>Stop update emails?</h2><p>You will no longer get emails about new businesses and deals in your area.</p>
<form method="POST" action="/unsubscribe?u=${escapeHtml(u)}&t=${escapeHtml(t)}"><button type="submit" style="padding:12px 28px;border:none;border-radius:24px;background:#e0562f;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Yes, stop the emails</button></form>`
: `<h2>This link is not valid</h2><p>You can change your update emails any time in Settings.</p>`}
<p style="margin-top:28px;"><a href="/" style="color:#e0562f;">Back to TT Discover</a></p></div></body></html>`);
});
app.post('/unsubscribe', async (req, res) => {
  const u = String(req.query.u || ''), t = String(req.query.t || '');
  if (!validUnsub(u, t) || !usersCol) return res.status(400).send('This link is not valid.');
  try {
    await usersCol.updateOne({ _id: new ObjectId(u) }, { $set: { preferredArea: '' } });
    res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Done — TT Discover</title></head><body style="font-family:Segoe UI,Arial,sans-serif;background:#fdf6ec;color:#2a2a2a;margin:0;"><div style="max-width:420px;margin:60px auto;padding:0 20px;text-align:center;"><h2>You are unsubscribed</h2><p>You will not get update emails any more. You can turn them back on any time in Settings.</p><p><a href="/" style="color:#e0562f;">Back to TT Discover</a></p></div></body></html>');
  } catch (err) { res.status(400).send('This link is not valid.'); }
});

// Weekly backup by email. An outside timer (for example cron-job.org) visits this once a week with the secret key
// in a header called x-cron-key. Sends the data backup (not the pictures) to ADMIN_EMAIL as a text file.
app.get('/api/cron/backup-email', async (req, res) => {
  const key = process.env.CRON_KEY || '';
  const given = String(req.headers['x-cron-key'] || '');
  const keyOk = key.length >= 16 && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!keyOk) return res.status(401).json({ error: 'Not allowed' });
  if (!dbHandle || !process.env.ADMIN_EMAIL) return res.status(503).json({ error: 'Database or ADMIN_EMAIL not set' });
  try {
    const names = (await dbHandle.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.') && n !== 'images');
    const chunks = []; let count = 0;
    for (const name of names){
      for await (const doc of dbHandle.collection(name).find({})){
        chunks.push(JSON.stringify({ c: name, d: BSON.EJSON.stringify(doc, { relaxed: false }) }) + '\n'); count++;
      }
    }
    const gz = Buffer.from(chunks.join(''), 'utf8');
    const day = new Date().toISOString().slice(0, 10);
    const tooBig = gz.length > 10 * 1024 * 1024;
    await sendMail(process.env.ADMIN_EMAIL, `TT Discover weekly backup ${day}`,
      tooBig
        ? `<p>This week's backup is too large to email (${Math.round(gz.length / 1048576)} MB). Please download it from the Admin page instead.</p>`
        : `<p>Your weekly TT Discover data backup is attached (${count} records, ${Math.round(gz.length / 1024)} KB).</p><p>It does not include pictures. To restore, open the Admin page, tap the Restore button and choose this file. Keep it private: it includes accounts.</p>`,
      undefined,
      tooBig ? undefined : { attachments: [{ name: `tt-discover-data-${day}.ndjson.txt`, content: gz.toString('base64') }] });
    dbHandle.collection('meta').updateOne({ _id: 'backup' }, { $set: { last_email: new Date() } }, { upsert: true }).catch(() => {});
    res.json({ ok: true, records: count, kb: Math.round(gz.length / 1024), emailed: !tooBig });
  } catch (err) {
    console.error('Backup email failed:', err.message);
    res.status(500).json({ error: 'Backup email failed.' });
  }
});

// Restore: the Admin page reads a backup file and sends it here in small batches of lines.
// Records are added or overwritten by their id. Nothing is ever deleted.
function parseBackupLines(lines){
  const byColl = {}; let skipped = 0;
  for (const line of lines){
    try {
      const rec = JSON.parse(String(line));
      if (!rec || typeof rec.c !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(rec.c) || typeof rec.d !== 'string') { skipped++; continue; }
      const doc = BSON.EJSON.parse(rec.d, { relaxed: false });
      if (!doc || doc._id === undefined || doc._id === null) { skipped++; continue; }
      (byColl[rec.c] = byColl[rec.c] || []).push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    } catch (e) { skipped++; }
  }
  return { byColl, skipped };
}
app.post('/api/admin/restore', requireAdmin, async (req, res) => {
  if (!dbHandle) return res.status(503).json({ error: 'Database not connected' });
  const lines = req.body && req.body.lines;
  if (!Array.isArray(lines) || !lines.length || lines.length > 1000) return res.status(400).json({ error: 'Nothing to restore in this batch.' });
  try {
    const { byColl, skipped } = parseBackupLines(lines);
    let restored = 0;
    for (const name of Object.keys(byColl)){
      await dbHandle.collection(name).bulkWrite(byColl[name], { ordered: false });
      restored += byColl[name].length;
    }
    res.json({ ok: true, restored, skipped });
  } catch (err) {
    console.error('Restore failed:', err.message);
    res.status(500).json({ error: 'Could not restore this batch: ' + err.message });
  }
});

// One-time (safe to repeat): moves photos that are still stored inside businesses, users and customer
// uploads into the images collection. Run it from the Admin page.
app.post('/api/admin/migrate-photos', requireAdmin, async (req, res) => {
  if (!imagesCol || !businessesCol || !usersCol || !photosCol) return res.status(503).json({ error: 'Database not connected' });
  const stats = { converted: 0, failed: 0, businesses: 0, users: 0, customerPhotos: 0 };
  const conv = async v => {
    if (!isDataImage(v)) return v;
    const r = await storeImage(v);
    if (r){ stats.converted++; return r; }
    stats.failed++; return v;   // could not be read: leave it exactly as it was
  };
  try {
    for await (const biz of businessesCol.find({})){
      const set = {};
      for (const k of ['imageUrl', 'logoUrl']) if (isDataImage(biz[k])) set[k] = await conv(biz[k]);
      for (const k of ['photos', 'menuPhotos', 'highlights']){
        if (Array.isArray(biz[k]) && biz[k].some(isDataImage)){
          const arr = []; for (const u of biz[k]) arr.push(await conv(u)); set[k] = arr;
        }
      }
      if (Array.isArray(biz.posts) && biz.posts.some(p => p && isDataImage(p.imageUrl))){
        const posts = []; for (const p of biz.posts) posts.push(p && isDataImage(p.imageUrl) ? { ...p, imageUrl: await conv(p.imageUrl) } : p); set.posts = posts;
      }
      if (Object.keys(set).length){ await businessesCol.updateOne({ _id: biz._id }, { $set: set }); stats.businesses++; }
    }
    for await (const u of usersCol.find({ avatarUrl: { $regex: '^data:image/' } }, { projection: { avatarUrl: 1 } })){
      const v = await conv(u.avatarUrl);
      if (v !== u.avatarUrl){ await usersCol.updateOne({ _id: u._id }, { $set: { avatarUrl: v } }); stats.users++; }
    }
    for await (const ph of photosCol.find({ url: { $regex: '^data:image/' } }, { projection: { url: 1 } })){
      const v = await conv(ph.url);
      if (v !== ph.url){ await photosCol.updateOne({ _id: ph._id }, { $set: { url: v } }); stats.customerPhotos++; }
    }
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('Photo migration failed:', err.message);
    res.status(500).json({ error: 'Stopped part-way: ' + err.message + '. Nothing was lost; run it again to continue.', ...stats });
  }
});

// ---------------- Link previews (WhatsApp, Facebook, iMessage, etc.) ----------------
// Those apps do not run the page's JavaScript, so the preview tags are written into the page here.
function shareMeta(o){
  const clean = (t, n) => escapeHtml(String(t || '').replace(/\s+/g, ' ').trim().slice(0, n));
  const title = clean(o.title, 100), desc = clean(o.desc, 200);
  return (o.titleTag ? `<title>${title}</title>\n` : '') +
`<meta name="description" content="${desc}">
<link rel="canonical" href="${escapeHtml(o.url)}">
<meta property="og:site_name" content="TT Discover">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(o.url)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${escapeHtml(o.image)}">
<meta property="og:image:alt" content="${clean(o.imageAlt || o.title, 120)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${escapeHtml(o.image)}">`;
}
// Only pictures with a real link can be shown in a preview (not old pictures still stored inside the page data).
function shareImageUrl(base, v){
  const s = String(v || '');
  if (/^\/img\/[a-f0-9]{24}$/.test(s)) return base + s;
  if (/^https:\/\//.test(s) && s.length < 1000) return s;
  return '';
}

app.get('/', (req, res) => {
  const base = siteUrl(req);
  try {
    const html = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const meta = shareMeta({ title: 'TT Discover', desc: 'Find local businesses, deals, events and jobs in Trinidad and Tobago.', url: base + '/', image: base + '/og-default.png', imageAlt: 'TT Discover' });
    res.send(html.replace('<!--META-->', meta));
  } catch (err) {
    res.status(500).send('Page template missing.');
  }
});

app.get('/biz/:id', async (req, res) => {
  if (!businessesCol) return res.status(404).send('Not found');
  let biz;
  try {
    biz = await businessesCol.findOne({ _id: new ObjectId(req.params.id) }, { projection: { name: 1, description: 1, imageUrl: 1, logoUrl: 1, category: 1, area: 1, tagline: 1, photos: { $slice: 1 } } });
  } catch (err) {
    biz = null;
  }
  if (!biz) return res.status(404).send('<h1>Listing not found</h1><a href="/">Back to TT Discover</a>');

  const today = new Date().toISOString().slice(0, 10);
  if (!req.query.embed) businessesCol.updateOne({ _id: biz._id }, { $inc: { [`viewsByDay.${today}`]: 1 } }).catch(() => {});

  const base = siteUrl(req);
  const where = [biz.category, biz.area].filter(Boolean).join(' in ');
  const desc = (biz.description || '').trim() || biz.tagline || (where ? where + '. Find it on TT Discover.' : 'See this business on TT Discover.');
  const image = shareImageUrl(base, biz.imageUrl) || shareImageUrl(base, Array.isArray(biz.photos) && biz.photos[0]) || shareImageUrl(base, biz.logoUrl) || base + '/og-default.png';
  const meta = shareMeta({ titleTag: true, title: (biz.name || 'Business') + ' — TT Discover', desc, url: base + '/biz/' + req.params.id, image, imageAlt: biz.name });
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
    const created = await usersCol.insertOne({ email, passwordHash, sessionToken, accountType, ...(mailEnabled ? { emailVerified: false } : {}), createdAt: new Date() });
    if (mailEnabled) issueVerifyToken(req, created.insertedId, email).catch(() => {});
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

// "Contact us": anyone can write to the site owner about a problem. No account needed.
app.post('/api/contact', async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().slice(0, 150);
    const topic = String(b.topic || 'Something else').trim().slice(0, 60);
    const message = String(b.message || '').trim().slice(0, 2000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email so we can reply.' });
    if (message.length < 10) return res.status(400).json({ error: 'Please write a few sentences so we can help.' });
    if (!rateCheck('contact:' + req.ip, 5, 60 * 60 * 1000)) return res.status(429).json({ error: 'You have sent several messages. Please try again later.' });
    if (!process.env.ADMIN_EMAIL) return res.status(503).json({ error: 'Contact is not set up yet. Please try again later.' });
    await sendMail(process.env.ADMIN_EMAIL, `TT Discover contact: ${topic}`,
      `<p><b>From:</b> ${escapeHtml(name || 'Not given')} (${escapeHtml(email)})</p><p><b>About:</b> ${escapeHtml(topic)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p style="color:#888;font-size:12px;">Reply to this email to answer them.</p>`, email);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not send your message.' }); }
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
    verificationRequired: mailEnabled,
    preferredArea: user.preferredArea || null,
    plan: user.plan || 'free',
    photoLimit: PHOTO_LIMIT[effectivePlan(user)],
    premiumMethod: user.premiumMethod || null,
    premiumExpiresAt: user.premiumExpiresAt || null,
    username: user.username || '',
    realName: user.realName || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    banned: user.banned ? { reason: user.banned.reason || '', at: user.banned.at || null, appeal: user.appeal ? { message: user.appeal.message, createdAt: user.appeal.createdAt } : null } : null,
    warnings: (user.warnings || []).filter(w => !w.seen).map(w => ({ id: String(w._id), message: w.message, bizName: w.bizName || '', createdAt: w.createdAt }))
  });
});

// A suspended person can write one note at a time explaining why they should be unbanned.
app.post('/api/me/appeal', requireUser, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    if (!req.user.banned) return res.status(400).json({ error: 'Your account is not suspended.' });
    const message = String((req.body || {}).message || '').trim().slice(0, 1000);
    if (message.length < 10) return res.status(400).json({ error: 'Please write a few sentences so we can understand.' });
    if (!rateCheck('appeal:' + req.user._id.toString(), 3, 24 * 60 * 60 * 1000)) return res.status(429).json({ error: 'You have sent several notes today. Please wait and try again tomorrow.' });
    await usersCol.updateOne({ _id: req.user._id }, { $set: { appeal: { message, createdAt: new Date() } } });
    if (process.env.ADMIN_EMAIL) sendMail(process.env.ADMIN_EMAIL, 'Appeal from a suspended account',
      `<p><b>${escapeHtml(req.user.email)}</b> wrote a note asking to be unbanned.</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><a href="${siteUrl(req)}/admin.html">Open the admin page</a></p>`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not send your note.' }); }
});

app.post('/api/me/warnings/seen', requireUser, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    await usersCol.updateOne({ _id: req.user._id }, { $set: { 'warnings.$[w].seen': true } }, { arrayFilters: [{ 'w.seen': { $ne: true } }] });
    res.json({ ok: true });
  } catch (err) { res.json({ ok: true }); }
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
    const storedAvatar = await storeImage(avatarUrl);
    await usersCol.updateOne({ _id: req.user._id }, { $set: { username, realName, bio, avatarUrl: storedAvatar } });
    res.json({ ok: true, username, realName, bio, avatarUrl: storedAvatar });
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
// A page colour picked by the owner, like #1a8f5c. Anything else means "use the design's own colours".
function sanitizeColor(v){ return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : ''; }

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
    const storedUrl = await storeImage(url);
    if (!storedUrl) return res.status(400).json({ error: 'Please choose a photo.' });
    const doc = { bizId: req.params.id, userId: req.user._id.toString(), username: String(req.user.username || '').slice(0, 60), url: storedUrl, createdAt: new Date() };
    const r = await photosCol.insertOne(doc);
    res.json({ photo: { _id: r.insertedId.toString(), url: storedUrl, username: doc.username, userId: doc.userId, createdAt: doc.createdAt } });
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

const TEMPLATES = ['food', 'fabric', 'beauty', 'build', 'bar', 'learn', 'farm', 'office'];
// Designs only Premium businesses can pick. A page that already uses one keeps it if the plan ends.
const PREMIUM_TEMPLATES = ['bar', 'learn', 'farm', 'office'];
function templateAllowed(template, ownerUser, existingTemplate){
  return !PREMIUM_TEMPLATES.includes(template) || template === existingTemplate || effectivePlan(ownerUser) === 'premium';
}
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
      imageUrl: await storeImage(b.imageUrl),
      logoUrl: await storeImage(b.logoUrl),
      tagline: String(b.tagline || '').trim().slice(0, 60),
      photos: await sanitizePhotoArray(b.photos),
      menuPhotos: await sanitizePhotoArray(b.menuPhotos),
      highlights: await sanitizePhotoArray(b.highlights),
      template: TEMPLATES.includes(b.template) && templateAllowed(b.template, req.user, '') ? b.template : 'food',
      brandColor: sanitizeColor(b.brandColor),
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
      () => `<p>A new business just joined TT Discover in <b>${escapeHtml(doc.area)}</b>:</p>
             <h3>${escapeHtml(doc.name)}</h3>
             <p>${escapeHtml(doc.description || '')}</p>
             <p>Category: ${escapeHtml(doc.category)}</p>
             ${bizLink(result.insertedId)}`
    );
    if (doc.deals.length){
      notifyAreaCustomers(
        doc.area,
        `New deal at ${doc.name}: ${doc.deals[0].title}`,
        () => `<p><b>${escapeHtml(doc.name)}</b> in ${escapeHtml(doc.area)} just posted a new deal:</p>
               <h3>${escapeHtml(doc.deals[0].title)}</h3>
               <p>${escapeHtml(doc.deals[0].description || '')}</p>
               ${bizLink(result.insertedId)}`
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
    if (typeof b.imageUrl === 'string') update.imageUrl = await storeImage(b.imageUrl);
    if (Array.isArray(b.photos)) update.photos = await sanitizePhotoArray(b.photos);
    if (Array.isArray(b.menuPhotos)) update.menuPhotos = await sanitizePhotoArray(b.menuPhotos);
    if (Array.isArray(b.highlights)) update.highlights = await sanitizePhotoArray(b.highlights);
    if (typeof b.hiring === 'boolean') update.hiring = b.hiring;
    if (TEMPLATES.includes(b.template)){
      if (!templateAllowed(b.template, ownerUser, biz.template)) return res.status(403).json({ error: 'That design is for Premium businesses. Pick one of the free designs, or upgrade to Premium.' });
      update.template = b.template;
    }
    if (typeof b.brandColor === 'string') update.brandColor = sanitizeColor(b.brandColor);
    if (typeof b.tagline === 'string') update.tagline = b.tagline.trim().slice(0, 60);
    if (typeof b.logoUrl === 'string') update.logoUrl = await storeImage(b.logoUrl);
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
    if (reportsCol) await reportsCol.updateMany({ bizId: req.params.id, status: 'open' }, { $set: { status: 'removed', closedAt: new Date() } });
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
      imageUrl: await storeImage(b.imageUrl),
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


app.post('/api/my/businesses/:id/jobs', requireBizPermission('jobs'), async (req, res) => {
  try {
    const biz = req.biz;
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

app.delete('/api/my/businesses/:id/jobs/:jobId', requireBizPermission('jobs'), async (req, res) => {
  try {
    const biz = req.biz;
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
app.post('/api/my/businesses/:id/reviews/:reviewId/reply', requireBizPermission('reviews'), async (req, res) => {
  try {
    const biz = req.biz;
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
// Gallery photos: the owner, or staff who were given the "photos" permission.
app.put('/api/my/businesses/:id/photos', requireBizPermission('photos'), async (req, res) => {
  try {
    const biz = req.biz;
    const b = req.body || {};
    if (!Array.isArray(b.photos)) return res.status(400).json({ error: 'Nothing to update.' });
    const ownerUser = await usersCol.findOne({ _id: new ObjectId(biz.ownerId) });
    const photoErr = photoLimitError({ photos: b.photos }, effectivePlan(ownerUser), biz);
    if (photoErr) return res.status(403).json({ error: photoErr });
    const photos = await sanitizePhotoArray(b.photos);
    await businessesCol.updateOne({ _id: biz._id }, { $set: { photos } });
    res.json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: 'Could not save photos.' }); }
});

// Opening hours and phone/email: the owner, or staff with the "info" permission.
app.put('/api/my/businesses/:id/info', requireBizPermission('info'), async (req, res) => {
  try {
    const biz = req.biz;
    const b = req.body || {};
    const update = {};
    if (typeof b.phone === 'string') update.phone = b.phone.slice(0, 40);
    if (typeof b.email === 'string') update.email = b.email.slice(0, 150);
    if (b.hours) update.hours = sanitizeHours(b.hours);
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update.' });
    await businessesCol.updateOne({ _id: biz._id }, { $set: update });
    res.json({ ok: true, ...update });
  } catch (err) { res.status(500).json({ error: 'Could not save.' }); }
});

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
      () => `<p><b>${escapeHtml(biz.name)}</b> in ${escapeHtml(biz.area)} just posted a new deal:</p>
             <h3>${escapeHtml(deal.title)}</h3>
             <p>${escapeHtml(deal.description || '')}</p>
             ${bizLink(biz._id)}`
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
      permissions: { posts: !!b.posts, deals: !!b.deals, jobs: !!b.jobs, photos: !!b.photos, info: !!b.info, reviews: !!b.reviews },
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
    const found = await usersCol.findOne({ email, accountType: { $ne: 'customer' } });
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
    res.json({ ok: true, pending: true, emailSent: mailEnabled });
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
      if (!user || user.accountType === 'customer') return res.status(400).json({ error: 'Your account needs to be a business account first. Switch it in Settings, then open this link again.' });
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

// Signed-in people can also see and answer their invitations inside the site (Business Studio),
// so they don't depend on the email link opening in the right browser.
app.get('/api/my/invites', requireUser, async (req, res) => {
  if (!invitesCol) return res.json([]);
  try {
    const list = await invitesCol.find({ inviteeId: req.user._id.toString(), status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
    res.json(list.map(i => ({ _id: i._id.toString(), bizName: i.bizName, inviterEmail: i.inviterEmail, createdAt: i.createdAt, expiresAt: i.expiresAt })));
  } catch (err) { res.json([]); }
});

app.post('/api/my/invites/:id/respond', requireUser, requireBusinessAccount, async (req, res) => {
  if (!invitesCol || !businessesCol) return res.status(503).json({ error: 'Not available right now.' });
  try {
    const action = (req.body || {}).action === 'accept' ? 'accept' : (req.body || {}).action === 'decline' ? 'decline' : '';
    if (!action) return res.status(400).json({ error: 'Choose Accept or Cancel.' });
    const uid = req.user._id.toString();
    const inv = await invitesCol.findOne({ _id: new ObjectId(req.params.id), inviteeId: uid });
    if (!inv) return res.status(404).json({ error: 'Invitation not found.' });
    if (inv.status !== 'pending') return res.status(400).json({ error: 'This invitation was already answered or cancelled.' });
    if (inv.expiresAt < new Date()) return res.status(400).json({ error: 'This invitation has expired. Ask the owner to send a new one.' });
    if (action === 'accept'){
      const biz = await businessesCol.findOne({ _id: new ObjectId(inv.bizId) });
      if (!biz) return res.status(404).json({ error: 'That business no longer exists.' });
      const claimed = await invitesCol.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'accepted', answeredAt: new Date() } });
      if (!claimed.modifiedCount) return res.status(400).json({ error: 'This invitation was already answered.' });
      if (!(biz.collaborators || []).some(c => c.userId === uid)){
        await businessesCol.updateOne({ _id: biz._id }, { $push: { collaborators: { userId: uid, email: inv.inviteeEmail, addedAt: new Date() } } });
      }
    } else {
      const claimed = await invitesCol.updateOne({ _id: inv._id, status: 'pending' }, { $set: { status: 'declined', answeredAt: new Date() } });
      if (!claimed.modifiedCount) return res.status(400).json({ error: 'This invitation was already answered.' });
    }
    sendMail(inv.inviterEmail, `${inv.inviteeEmail} ${action === 'accept' ? 'accepted' : 'declined'} your invitation`,
      `<p><b>${escapeHtml(inv.inviteeEmail)}</b> ${action === 'accept' ? 'accepted your invitation and can now help manage' : 'declined your invitation to help manage'} <b>${escapeHtml(inv.bizName)}</b>.</p>`);
    res.json({ ok: true, action, bizName: inv.bizName });
  } catch (err) {
    console.error('Invite response (signed in) failed:', err.message);
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
    const biz = await businessesCol.findOne({ _id: new ObjectId(bizId) }, { projection: { name: 1, reviews: 1, ownerId: 1 } });
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    if (type === 'review' && !(biz.reviews || []).some(r => String(r._id) === targetId)) return res.status(404).json({ error: 'Review not found.' });
    if (type === 'photo' && !(photosCol && await photosCol.findOne({ _id: new ObjectId(targetId), bizId }))) return res.status(404).json({ error: 'Photo not found.' });
    const already = await reportsCol.findOne({ reporterId, type, bizId, targetId, status: 'open' });
    if (!already){
      const reason = REPORT_REASONS.includes(b.reason) ? b.reason : 'Other';
      let targetUserId = '';
      if (type === 'business') targetUserId = biz.ownerId || '';
      else if (type === 'review'){ const rv = (biz.reviews || []).find(r => String(r._id) === targetId); targetUserId = (rv && rv.authorId) || ''; }
      else { const ph = await photosCol.findOne({ _id: new ObjectId(targetId) }, { projection: { userId: 1 } }); targetUserId = (ph && ph.userId) || ''; }
      await reportsCol.insertOne({ type, bizId, targetId, targetUserId, reason, details: String(b.details || '').trim().slice(0, 500), reporterId, reporterEmail: req.user.email, status: 'open', createdAt: new Date() });
      if (process.env.ADMIN_EMAIL) sendMail(process.env.ADMIN_EMAIL, `New report: ${type} on ${biz.name}`, `<p>A <b>${type}</b> on <b>${escapeHtml(biz.name)}</b> was reported.</p><p><b>Reason:</b> ${escapeHtml(reason)}</p>${b.details ? `<p><b>Note:</b> ${escapeHtml(String(b.details).trim().slice(0, 500))}</p>` : ''}<p><a href="${siteUrl(req)}/admin.html">Open the admin page to review it</a></p>`);
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
      const item = { _id: r._id.toString(), type: r.type, bizId: r.bizId, reason: r.reason, details: r.details, reporterEmail: r.reporterEmail, createdAt: r.createdAt, bizName: '', preview: '', imageUrl: '', gone: false, targetUserId: r.targetUserId || '', targetEmail: '', targetBanned: false };
      try {
        const biz = await businessesCol.findOne({ _id: new ObjectId(r.bizId) }, { projection: { name: 1, reviews: 1, ownerId: 1 } });
        if (!item.targetUserId && biz){
          if (r.type === 'business') item.targetUserId = biz.ownerId || '';
          else if (r.type === 'review'){ const rv = (biz.reviews || []).find(x => String(x._id) === r.targetId); item.targetUserId = (rv && rv.authorId) || ''; }
          else { const ph0 = await photosCol.findOne({ _id: new ObjectId(r.targetId) }, { projection: { userId: 1 } }); item.targetUserId = (ph0 && ph0.userId) || ''; }
        }
        if (item.targetUserId){
          const tu = await usersCol.findOne({ _id: new ObjectId(item.targetUserId) }, { projection: { email: 1, banned: 1 } });
          if (tu){ item.targetEmail = tu.email; item.targetBanned = !!tu.banned; }
        }
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

// ---------------- Warnings and bans (admin) ----------------
app.post('/api/admin/users/:id/warn', requireAdmin, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const message = String((req.body || {}).message || '').trim().slice(0, 500);
    const bizName = String((req.body || {}).bizName || '').trim().slice(0, 120);
    if (!message) return res.status(400).json({ error: 'Write a short warning first.' });
    const user = await usersCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ error: 'That account no longer exists.' });
    const warning = { _id: new ObjectId(), message, bizName, createdAt: new Date(), seen: false };
    await usersCol.updateOne({ _id: user._id }, { $push: { warnings: { $each: [warning], $slice: -20 } } });
    sendMail(user.email, 'A warning about your TT Discover account',
      `<p>Hello,</p><p>We received a report${bizName ? ` about <b>${escapeHtml(bizName)}</b>` : ''} on TT Discover and want to give you a friendly warning:</p><p style="padding:10px 14px;background:#fff3cd;border-radius:8px;">${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>If this was a mistake, please fix it. Repeated problems can lead to your account being suspended.</p>`);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not send the warning.' }); }
});

app.post('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const reason = String((req.body || {}).reason || '').trim().slice(0, 500);
    if (!reason) return res.status(400).json({ error: 'Write the reason for the ban first.' });
    const user = await usersCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ error: 'That account no longer exists.' });
    await usersCol.updateOne({ _id: user._id }, { $set: { banned: { reason, at: new Date() } }, $unset: { appeal: '' } });
    sendMail(user.email, 'Your TT Discover account has been suspended',
      `<p>Hello,</p><p>Your TT Discover account has been suspended.</p><p><b>Reason:</b> ${escapeHtml(reason)}</p><p>If you think this was a mistake, sign in at <a href="${siteUrl(req)}/account.html">${siteUrl(req)}/account.html</a> and write us a note explaining why. We will read it.</p>`);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not ban this account.' }); }
});

app.post('/api/admin/users/:id/unban', requireAdmin, async (req, res) => {
  if (!usersCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    const user = await usersCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return res.status(404).json({ error: 'That account no longer exists.' });
    await usersCol.updateOne({ _id: user._id }, { $unset: { banned: '', appeal: '' } });
    sendMail(user.email, 'Your TT Discover account is active again',
      `<p>Hello,</p><p>Your TT Discover account has been restored and you can use it again. Please follow the <a href="${siteUrl(req)}/terms.html">terms of use</a> so this does not happen again.</p>`);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: 'Could not unban this account.' }); }
});

app.get('/api/admin/banned', requireAdmin, async (req, res) => {
  if (!usersCol) return res.json([]);
  try {
    const list = await usersCol.find({ banned: { $exists: true } }).sort({ 'banned.at': -1 }).limit(200).toArray();
    res.json(list.map(u => ({ id: u._id.toString(), email: u.email, reason: u.banned.reason || '', at: u.banned.at, appeal: u.appeal ? { message: u.appeal.message, createdAt: u.appeal.createdAt } : null })));
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

app.delete('/api/admin/businesses/:id', requireAdmin, async (req, res) => {
  if (!businessesCol) return res.status(503).json({ error: 'Database not connected' });
  try {
    await businessesCol.deleteOne({ _id: new ObjectId(req.params.id) });
    if (reportsCol) await reportsCol.updateMany({ bizId: req.params.id, status: 'open' }, { $set: { status: 'removed', closedAt: new Date() } });
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

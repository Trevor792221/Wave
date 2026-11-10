// Wave crash relay: a Cloudflare Worker that turns crash reports sent by Wave into GitHub
// issues on Trevor792221/Wave. It holds the GitHub token (the GITHUB_TOKEN secret, a
// fine-grained token with only "Issues: read and write" on this repository); Wave only knows
// this Worker's address. Setup: relay/README.md.
//
// POST /report  {app, version, android, device, log}
//   - checks the report (known app, plain version, short fields, a Java stack trace, size limit)
//   - works out the crash's signature: the error type and the first line of Wave's own code
//   - an open issue with that signature already: adds a comment (version, Android, phone)
//   - otherwise: opens a new issue labelled "crash" with the log
// Reports are public (the repository is), so only what's needed is kept: no addresses' query
// strings or anything that looks like an email address.

const REPO = 'Trevor792221/Wave';
const APPS = ['Wave', 'Wave Mobile', 'Wave Beta', 'Wave Mobile Beta'];
const MAX_LOG = 20000;
const MAX_COMMENTS = 50; // a crash reported this often doesn't need more comments
// Limits (with the LIMITS KV namespace bound to the Worker; without it there are none):
const PER_SENDER_PER_MINUTE = 5;
const PER_DAY = 30; // new issues and comments together

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/report') return reply(404, 'not found');
    if (!env.GITHUB_TOKEN) return reply(500, 'relay not set up');
    let r;
    try {
      r = await req.json();
    } catch (e) {
      return reply(400, 'not JSON');
    }
    const bad = check(r);
    if (bad) return reply(400, bad);
    const limited = await overLimit(env.LIMITS, req.headers.get('CF-Connecting-IP') || 'unknown');
    if (limited) return reply(429, limited);

    const log = clean(r.log);
    const sig = signature(log);
    const id = (await sha256(sig)).slice(0, 12);
    const who = `${r.app} ${r.version}, Android ${r.android}, ${r.device}`;
    const gh = github(env.GITHUB_TOKEN);

    // An open crash issue with the same signature: add to it.
    const found = await gh('GET', `/search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open label:crash "crash-id: ${id}" in:body`)}`);
    const existing = found.ok && found.body.items && found.body.items[0];
    if (existing) {
      if (existing.comments >= MAX_COMMENTS) return reply(200, `known: #${existing.number}`);
      const c = await gh('POST', `/repos/${REPO}/issues/${existing.number}/comments`, {
        body: `Happened again: ${who}\n\n<details><summary>Crash log</summary>\n\n${fence(log)}\n</details>`,
      });
      return c.ok ? reply(200, `added to #${existing.number}`) : reply(502, 'GitHub refused the comment');
    }

    const title = `Crash: ${sig.split('\n')[0].slice(0, 120)} (${r.app} ${r.version})`;
    const body = [
      `**${who}**`,
      '',
      'Sent automatically by Wave after a crash.',
      '',
      fence(log),
      '',
      `<!-- crash-id: ${id} -->`,
      `crash-id: ${id}`,
    ].join('\n');
    const created = await gh('POST', `/repos/${REPO}/issues`, { title, body, labels: ['crash'] });
    return created.ok ? reply(201, `opened #${created.body.number}`) : reply(502, 'GitHub refused the issue');
  },
};

// Counts reports in KV: per sender (by address, kept a minute) and per day (kept two days).
// KV keeps a key for at least 60 s, and its counts can lag a little; that's fine for this.
async function overLimit(kv, ip) {
  if (!kv) return null;
  const day = 'day:' + new Date().toISOString().slice(0, 10);
  const sender = 'ip:' + (await sha256(ip)).slice(0, 16); // the address itself isn't stored
  const [d, s] = await Promise.all([kv.get(day), kv.get(sender)]);
  const dn = Number(d) || 0, sn = Number(s) || 0;
  if (dn >= PER_DAY) return 'daily limit reached';
  if (sn >= PER_SENDER_PER_MINUTE) return 'too many reports, try later';
  await Promise.all([
    kv.put(day, String(dn + 1), { expirationTtl: 2 * 86400 }),
    kv.put(sender, String(sn + 1), { expirationTtl: 60 }),
  ]);
  return null;
}

function check(r) {
  if (!r || typeof r !== 'object') return 'no report';
  if (!APPS.includes(r.app)) return 'unknown app';
  if (typeof r.version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(r.version)) return 'bad version';
  if (typeof r.android !== 'string' || !/^[\w. -]{1,20}$/.test(r.android)) return 'bad Android version';
  if (typeof r.device !== 'string' || !/^[\w .()+\-]{1,60}$/.test(r.device)) return 'bad device';
  if (typeof r.log !== 'string' || r.log.length < 20 || r.log.length > MAX_LOG) return 'bad log size';
  if (!/(Exception|Error)\b/.test(r.log) || !/\n\s*at [\w$.]+\(/.test(r.log)) return 'not a crash log';
  return null;
}

// Only what helps fix the crash: addresses lose their query strings, emails are masked.
function clean(log) {
  return log
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, '$1?…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '(email)')
    .slice(0, MAX_LOG);
}

// The error's type (and message's first words) and the first frame in Wave's own code.
function signature(log) {
  const lines = log.split('\n').map((l) => l.trim());
  let cause = lines.find((l) => /^Caused by: /.test(l)) || lines.find((l) => /(Exception|Error)\b/.test(l)) || 'Unknown error';
  cause = cause.replace(/^Caused by: /, '').replace(/^[\w.$]*\.(\w+(Exception|Error))/, '$1');
  const m = cause.match(/^(\w+(?:Exception|Error))(?::\s*(.*))?$/);
  if (m) cause = m[1] + (m[2] ? ': ' + m[2].slice(0, 50) + (m[2].length > 50 ? '…' : '') : '');
  cause = cause.replace(/\d+/g, 'N').slice(0, 90);
  const frame = lines.find((l) => /^at com\.wave\./.test(l)) || lines.find((l) => /^at /.test(l)) || '';
  const where = frame.replace(/^at /, '').replace(/\(.*\)$/, '').replace(/^com\.wave\.\w+\./, '');
  return `${cause} in ${where || 'unknown'}`;
}

function fence(text) {
  return '```\n' + text.replace(/```/g, '`​``') + '\n```';
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function github(token) {
  return async (method, path, data) => {
    const res = await fetch('https://api.github.com' + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'wave-crash-relay',
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {}
    return { ok: res.ok, status: res.status, body };
  };
}

function reply(status, message) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

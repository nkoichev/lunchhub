// Scheduled pushes, called by pg_cron (see migration_fun_features.sql):
//
//   {"kind":"reminder"} — every 5 min on weekday mornings. Within the 5-min
//     window that starts REMINDER_MINUTES before LUNCH_CUTOFF (Bulgarian
//     time) it nudges the team's regulars who haven't ordered yet today.
//     push_log makes sure it goes out only once per day.
//
//   {"kind":"wrapped"} — on the 1st of each month: "your monthly Wrapped
//     is ready", opens the Wrapped screen when tapped.
//
// Deploy with:  npx supabase functions deploy lunch-reminder --no-verify-jwt
// Secrets:      CRON_SECRET (required), LUNCH_CUTOFF (default "11:30"),
//               REMINDER_MINUTES (default 10)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const LUNCH_CUTOFF = Deno.env.get('LUNCH_CUTOFF') ?? '11:30';
const REMINDER_MINUTES = Number(Deno.env.get('REMINDER_MINUTES') ?? 10);

const MONTHS_BG = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

// Bulgarian wall-clock parts, regardless of the server's timezone.
function sofiaNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    month: Number(get('month')),
    year: Number(get('year')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday'),
  };
}

function daysAgo(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function firstName(name: string) {
  return (name || '').trim().split(/\s+/)[0] || name;
}

async function sendPush(messages: unknown[]) {
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

// Insert-or-skip: returns false when this kind was already sent today.
async function claim(supabase: any, kind: string, date: string) {
  const { error } = await supabase.from('push_log').insert({ kind, sent_on: date });
  return !error;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  try {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase credentials missing');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { kind = 'reminder', force = false } = await req.json().catch(() => ({}));
    const now = sofiaNow();

    if (kind === 'wrapped') {
      const prevMonth = now.month === 1 ? 12 : now.month - 1;
      if (!force && !(await claim(supabase, 'wrapped', now.date))) return json({ skipped: 'already sent' });
      const { data: tokens } = await supabase.from('push_tokens').select('token');
      await sendPush(
        (tokens || []).map((t: { token: string }) => ({
          to: t.token,
          title: `🎁 Твоят LunchHub Wrapped за ${MONTHS_BG[prevMonth - 1]} е готов!`,
          body: 'Любимо ястие, похарчено, стъпки, хранителен близнак… Виж какъв месец беше 👀',
          sound: 'default',
          data: { screen: 'Wrapped', period: 'lastMonth' },
        }))
      );
      return json({ sent: tokens?.length ?? 0 });
    }

    // ---- reminder ----
    if (['Sat', 'Sun'].includes(now.weekday)) return json({ skipped: 'weekend' });
    const [h, m] = LUNCH_CUTOFF.split(':').map(Number);
    const cutoff = h * 60 + m;
    const remindAt = cutoff - REMINDER_MINUTES;
    if (!force && (now.minutes < remindAt || now.minutes >= remindAt + 5)) {
      return json({ skipped: 'outside window', now: now.minutes, remindAt });
    }
    if (!force && !(await claim(supabase, 'reminder', now.date))) return json({ skipped: 'already sent' });

    // "Regulars" = anyone who ordered in the last 14 days. Nudging people
    // who never order would just be spam.
    const { data: recent } = await supabase
      .from('orders')
      .select('user_id, order_date')
      .gte('order_date', daysAgo(now.date, 14));
    const regulars = new Set((recent || []).map((o: any) => o.user_id));
    const orderedToday = new Set(
      (recent || []).filter((o: any) => o.order_date === now.date).map((o: any) => o.user_id)
    );
    const missing = [...regulars].filter((id) => !orderedToday.has(id));
    if (!missing.length) return json({ skipped: 'everyone ordered' });

    const { data: users } = await supabase.from('users').select('id, name').in('id', [...orderedToday]);
    const orderedNames = (users || []).map((u: any) => firstName(u.name));
    const { data: tokens } = await supabase.from('push_tokens').select('token, user_id').in('user_id', missing);

    const already =
      orderedNames.length === 0
        ? 'Още никой не е поръчал — бъди първи! 🥇'
        : orderedNames.length <= 3
        ? `${orderedNames.join(', ')} вече ${orderedNames.length === 1 ? 'поръча' : 'поръчаха'}.`
        : `${orderedNames.length} души вече поръчаха.`;

    await sendPush(
      (tokens || []).map((t: { token: string }) => ({
        to: t.token,
        title: `⏰ ${REMINDER_MINUTES} минути до затваряне на поръчките!`,
        body:
          missing.length > 1
            ? `Още не си поръчал. ${already} Ти и още ${missing.length - 1} сте без обяд 🍲`
            : `Само ти остана без поръчка! ${already} 🍲`,
        sound: 'default',
        data: { screen: 'Menu' },
      }))
    );
    return json({ sent: tokens?.length ?? 0, missing: missing.length });
  } catch (e) {
    console.error('[lunch-reminder]', e);
    return json({ error: String(e) }, 500);
  }
});

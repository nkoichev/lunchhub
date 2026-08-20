import { supabase, isSupabaseConfigured } from '../config/supabase';

// Save this user's Revolut tag (e.g. "ivan95", without the @ or full URL).
export async function updateRevolutTag(userId, tag) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const clean = (tag || '').trim().replace(/^@/, '');
  const { error } = await supabase
    .from('users')
    .update({ revolut_tag: clean || null })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return clean;
}

// Save this user's phone number for Blink P2P transfers (e.g. "0888123456").
export async function updateBlinkPhone(userId, phone) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const clean = (phone || '').trim();
  const { error } = await supabase
    .from('users')
    .update({ blink_phone: clean || null })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return clean;
}

// Who is paying for everyone today (one payer per calendar day).
export async function fetchDayPayer(dateString) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('day_payers')
    .select('payer_user_id')
    .eq('order_date', dateString)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.payer_user_id ?? null;
}

// Set/change today's payer. Also stamps every order already placed today
// with this payer, so each order keeps a record of who was being paid —
// not just today's live picker state.
export async function setDayPayer(dateString, payerUserId) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const { error: upsertErr } = await supabase
    .from('day_payers')
    .upsert({ order_date: dateString, payer_user_id: payerUserId }, { onConflict: 'order_date' });
  if (upsertErr) throw new Error(upsertErr.message);

  const { error: stampErr } = await supabase
    .from('orders')
    .update({ payer_user_id: payerUserId })
    .eq('order_date', dateString);
  if (stampErr) throw new Error(stampErr.message);
}

// Mark one order as settled (or not).
export async function markOrderPaid(orderId, isPaid) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const { error } = await supabase.from('orders').update({ is_paid: isPaid }).eq('id', orderId);
  if (error) throw new Error(error.message);
}

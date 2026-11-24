import { supabase, isSupabaseConfigured } from '../config/supabase';
import { notifyReaction } from './pushService';

export const REACTION_EMOJIS = ['🔥', '😂', '😋', '🤢', '💪'];

// All reactions on the given orders, grouped: { [orderId]: { [emoji]: [{ userId, name }] } }
export async function fetchReactions(orderIds) {
  if (!isSupabaseConfigured || !orderIds?.length) return {};
  const { data, error } = await supabase
    .from('order_reactions')
    .select('order_id, user_id, emoji, users(name)')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((r) => {
    const byEmoji = (map[r.order_id] ??= {});
    (byEmoji[r.emoji] ??= []).push({ userId: r.user_id, name: r.users?.name ?? '—' });
  });
  return map;
}

// Tap once to add, tap again to take it back. Returns true if it's now on.
export async function toggleReaction(user, orderId, ownerUserId, emoji, currentlyOn) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  if (currentlyOn) {
    const { error } = await supabase
      .from('order_reactions')
      .delete()
      .eq('order_id', orderId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase
    .from('order_reactions')
    .upsert({ order_id: orderId, user_id: user.id, emoji }, { onConflict: 'order_id,user_id,emoji' });
  if (error) throw new Error(error.message);
  notifyReaction(user, ownerUserId, emoji);
  return true;
}

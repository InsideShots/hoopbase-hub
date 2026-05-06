import { supabase } from '@/lib/supabase'

export async function signOut() {
  await supabase.auth.signOut()
}

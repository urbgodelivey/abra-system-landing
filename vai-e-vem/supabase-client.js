const config = window.VAI_E_VEM_CONFIG || {};

export const remoteConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey
);

let clientPromise = null;

export async function getSupabase() {
  if (!remoteConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2.112.2?bundle').then(
      ({ createClient }) =>
        createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        })
    );
  }
  return clientPromise;
}

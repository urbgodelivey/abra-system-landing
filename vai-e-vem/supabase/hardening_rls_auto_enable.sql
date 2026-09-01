-- Vai e Vem — hardening de função preexistente sinalizada pelo Supabase Advisor.
-- Aplicar SOMENTE no projeto dedicado zcwpxkwgxjkgaknhnscu.
-- Esta função não foi criada pelo schema do Vai e Vem.
-- Objetivo: remover exposição via Data API sem apagar nem alterar a implementação da função.

begin;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

commit;

-- Validação somente leitura:
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'rls_auto_enable';

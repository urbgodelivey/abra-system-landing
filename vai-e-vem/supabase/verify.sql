-- Vai e Vem — verificação pós-migração (somente leitura)
-- Executar APÓS aplicar schema.sql no projeto Supabase exclusivo do Vai e Vem.

-- 1. Tabelas esperadas e RLS ligado.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'pricing_config',
    'app_config',
    'deliveries',
    'driver_locations',
    'delivery_messages'
  )
order by tablename;

-- Resultado esperado: 6 linhas e rowsecurity = true em todas.

-- 2. Políticas RLS instaladas.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'pricing_config',
    'app_config',
    'deliveries',
    'driver_locations',
    'delivery_messages'
  )
order by tablename, policyname;

-- 3. Realtime habilitado apenas nas tabelas operacionais necessárias.
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('deliveries', 'driver_locations', 'delivery_messages')
order by tablename;

-- Resultado esperado: 3 linhas.

-- 4. Configuração inicial de preço.
select id, minimum_price, included_km, price_per_extra_km, active
from public.pricing_config
where id = 1;

-- 5. Configuração Pix inicial.
select id, pix_key, pix_holder, pix_city
from public.app_config
where id = 1;

-- 6. Confirma que nenhum cadastro ganhou role privilegiada automaticamente.
select role, count(*)
from public.profiles
group by role
order by role;

-- Observação: testes de permissão devem ser feitos também com sessões reais de
-- establishment, driver e admin. Não considere o backend pronto somente porque
-- estas consultas administrativas passaram.

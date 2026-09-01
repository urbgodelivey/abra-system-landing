-- Vai e Vem — bootstrap administrativo de roles.
-- Executar SOMENTE no projeto Supabase exclusivo do Vai e Vem.
-- NÃO executar em ArkGo/UrbGo/ABRA.
--
-- Motivo: todo signup público nasce como 'establishment'. Isso impede que um
-- usuário se transforme em driver/admin pelo frontend. A promoção inicial é
-- deliberadamente feita por um administrador do banco.

-- 1) Liste os usuários e confira o e-mail/ID antes de qualquer alteração.
select
  u.id,
  u.email,
  p.role,
  p.full_name,
  p.business_name,
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- 2) PROMOVER MOTORISTA
-- Substitua o e-mail abaixo pelo e-mail REAL criado para o motorista.
-- Deixe comentado até conferir o usuário acima.
-- update public.profiles p
-- set role = 'driver', updated_at = now()
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = lower('MOTORISTA@EXEMPLO.COM');

-- 3) PROMOVER ADMINISTRADOR
-- Substitua o e-mail abaixo pelo e-mail REAL escolhido para administração.
-- Deixe comentado até conferir o usuário acima.
-- update public.profiles p
-- set role = 'admin', updated_at = now()
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = lower('ADMIN@EXEMPLO.COM');

-- 4) VERIFICAÇÃO FINAL
select
  u.email,
  p.id,
  p.role,
  p.full_name,
  p.business_name
from public.profiles p
join auth.users u on u.id = p.id
where p.role in ('driver', 'admin')
order by p.role, u.email;

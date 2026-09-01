# Vai e Vem — MVP isolado

## Regra de preservação

Este diretório é uma área de desenvolvimento independente para o projeto Vai e Vem.

**Não modificar, renomear, converter ou reutilizar como destino de commits os repositórios originais:**

- `ArkGObr/UrbGo`
- `ArkGObr/arkgo-admin`
- `ArkGObr/abrasystem-painel-web`
- `ArkGObr/abra-system-landing`
- `ArkGObr/arkgo-landing`

Os projetos originais servem somente como fonte de arquitetura, padrões e módulos reaproveitáveis.

## Objetivo do MVP

Operação local em Caruaru-PE para aproximadamente 10–15 estabelecimentos e 20–30 entregas por dia, inicialmente com um motorista.

## Projeto Supabase exclusivo

O Vai e Vem possui um projeto Supabase separado:

- Project Ref: `zcwpxkwgxjkgaknhnscu`
- URL pública: `https://zcwpxkwgxjkgaknhnscu.supabase.co`

**Esse projeto é o único destino permitido para o banco do Vai e Vem.**

A publishable key moderna ativa foi confirmada e configurada em `config.js`. Nunca colocar `service_role`, secret key, senha de banco ou qualquer credencial privada no frontend.

## Implementado no frontend

- PWA mobile-first acessível por link;
- modo local de demonstração quando o backend não estiver configurado;
- modo Supabase remoto configurado;
- cadastro de estabelecimento;
- login/logout;
- criação de entrega;
- preço a partir da distância informada;
- valor mínimo + quilômetros incluídos + preço por km excedente;
- pagamento Dinheiro ou Pix;
- Pix copia-e-cola com valor da entrega;
- QR Code Pix gerado no navegador;
- payload Pix alinhado ao Manual de Padrões para Iniciação do Pix v2.10.0 do Banco Central;
- fluxo de status:
  - Solicitado;
  - Aceito;
  - Indo para coleta;
  - Pedido coletado;
  - Em entrega;
  - Entregue;
- cancelamento controlado;
- abertura de navegação para coleta/destino;
- GPS do motorista via navegador;
- mapa de localização;
- histórico;
- ganhos hoje / 7 dias / mês;
- chat vinculado ao pedido;
- painel operacional/admin;
- configuração de preços e Pix;
- Supabase Realtime para entregas, localização e mensagens;
- service worker com cache do shell da PWA sem prender `config.js` em cache antigo.

## Backend instalado

`supabase/schema.sql` foi aplicado no projeto dedicado como migração `vai_e_vem_mvp_schema`.

O backend possui:

- `profiles`;
- `pricing_config`;
- `app_config`;
- `deliveries`;
- `driver_locations`;
- `delivery_messages`;
- roles `establishment`, `driver`, `admin`;
- cálculo de preço no servidor;
- regras de transição de status;
- timestamps operacionais;
- RLS em 6/6 tabelas;
- 22 políticas RLS;
- Realtime em `deliveries`, `driver_locations` e `delivery_messages`;
- cadastro inicial sempre como `establishment`;
- nenhuma autorização baseada em `user_metadata`.

`supabase/verify.sql` foi executado com sucesso após a migração.

Configuração inicial validada:

- mínimo: R$ 7,00;
- incluídos: 3 km;
- km adicional: R$ 1,50;
- precificação ativa;
- titular Pix: Vai e Vem;
- cidade Pix: Caruaru;
- chave Pix: ainda não configurada.

## Advisors

O advisor de segurança apontou dois warnings ligados à função preexistente `public.rls_auto_enable()`.

Essa função **não foi criada pelo schema do Vai e Vem**. Ela foi encontrada como `SECURITY DEFINER` e executável por roles públicas. O arquivo `supabase/hardening_rls_auto_enable.sql` foi preparado para revogar `EXECUTE` de `public`, `anon` e `authenticated` sem apagar nem modificar a implementação da função.

O advisor de performance apontou:

- 4 foreign keys ainda sem índice de cobertura;
- índices recém-criados marcados como `unused`, esperado em banco ainda sem tráfego;
- múltiplas políticas permissivas em operações de `deliveries` e `driver_locations`.

Esses itens devem ser reavaliados após os primeiros testes e antes de escalar volume.

## App motorista

Existe um cliente Flutter mínimo em `driver/` com:

- login;
- solicitações pendentes;
- aceitar entrega;
- entrega atual;
- avanço de status;
- histórico;
- ganhos;
- Supabase Realtime;
- GPS com foreground service no Android;
- navegação externa para coleta e destino.

O app recebe `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` por `--dart-define` no build, evitando credenciais privadas versionadas.

## Próximas validações obrigatórias

1. aplicar e validar `supabase/hardening_rls_auto_enable.sql` no projeto dedicado;
2. rodar novamente advisors de segurança e performance;
3. criar usuários de teste para `establishment`, `driver` e `admin`;
4. promover os usuários de motorista/admin de forma administrativa usando `bootstrap_roles.sql`;
5. testar RLS com operações permitidas e negadas;
6. publicar a PWA em hosting isolado;
7. testar pedido em dois aparelhos diferentes;
8. testar Realtime, chat e localização;
9. compilar e testar o app Flutter do motorista;
10. integrar cálculo automático de rota/distância.

## GPS do motorista

A PWA consegue compartilhar GPS enquanto o navegador mantém a execução, porém **GPS contínuo em segundo plano não é confiável em PWA móvel** quando o motorista troca para outro aplicativo, bloqueia a tela ou entra na navegação.

Por isso o módulo Flutter do motorista é o caminho recomendado para a operação real, mantendo Web/PWA para estabelecimentos e painel/admin.

## Ainda pendente no produto

- hardening final do warning `public.rls_auto_enable()`;
- chave Pix da operação;
- cálculo automático da distância por serviço de rotas;
- testes multiaparelho;
- compilação/teste do motorista Android;
- implantação/hosting definitivo.

## Não entra no MVP

- ArkCoins;
- XP;
- níveis;
- Ark Shop;
- anúncios;
- passageiros;
- mototáxi;
- múltiplos veículos;
- carteira/saldo do entregador;
- comissão de 25%;
- recarga de motorista;
- marketplace de motoristas;
- aprovação documental complexa;
- expansão nacional;
- financeiro/fiscal completo do ABRA.

## Origem técnica do reaproveitamento

- `UrbGo`: modelo de entrega, status, GPS, tracking, histórico, chat, ganhos e Supabase Realtime.
- `arkgo-admin`: referências para listagem operacional, mapa ao vivo e painel.
- `abrasystem-painel-web`: referências de experiência web, formulários, mapas e organização visual.

Nenhum segredo ou credencial privada dos projetos de origem deve ser copiado para este MVP.

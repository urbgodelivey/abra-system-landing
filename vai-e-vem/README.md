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

## Advisors e hardening

O hardening de `public.rls_auto_enable()` foi aplicado no projeto dedicado sem alterar sua implementação nem qualquer tabela.

Estado confirmado após o hardening:

- função continua existindo;
- continua `SECURITY DEFINER`;
- owner continua `postgres`;
- `PUBLIC` sem `EXECUTE`;
- `anon` sem `EXECUTE`;
- `authenticated` sem `EXECUTE`;
- privilégios restantes: `postgres` e `service_role`;
- advisor de segurança: **0 warnings**.

O advisor de performance ainda aponta 13 avisos, sem correção automática:

- 4 foreign keys sem índice de cobertura;
- 4 índices classificados como não utilizados, esperado em banco novo sem tráfego;
- 5 casos de múltiplas políticas RLS permissivas.

Esses itens não bloqueiam o MVP e devem ser reavaliados após os primeiros testes e antes de escalar volume.

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

1. criar usuários de teste para `establishment`, `driver` e `admin`;
2. promover os usuários de motorista/admin de forma administrativa usando `bootstrap_roles.sql`;
3. testar RLS com operações permitidas e negadas;
4. publicar a PWA em hosting isolado;
5. testar pedido em dois aparelhos diferentes;
6. testar Realtime, chat e localização;
7. compilar e testar o app Flutter do motorista;
8. integrar cálculo automático de rota/distância.

## GPS do motorista

A PWA consegue compartilhar GPS enquanto o navegador mantém a execução, porém **GPS contínuo em segundo plano não é confiável em PWA móvel** quando o motorista troca para outro aplicativo, bloqueia a tela ou entra na navegação.

Por isso o módulo Flutter do motorista é o caminho recomendado para a operação real, mantendo Web/PWA para estabelecimentos e painel/admin.

## Ainda pendente no produto

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

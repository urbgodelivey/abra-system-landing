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

A publishable key ainda não está versionada. `config.js` mantém o campo vazio até a chave pública ser recuperada/confirmada. Nunca colocar `service_role`, secret key, senha de banco ou qualquer credencial privada no frontend.

## Implementado no frontend

- PWA mobile-first acessível por link;
- modo local de demonstração enquanto o backend não estiver configurado;
- modo Supabase preparado para ativação automática;
- cadastro de estabelecimento;
- login/logout;
- criação de entrega;
- preço a partir da distância informada;
- valor mínimo + quilômetros incluídos + preço por km excedente;
- pagamento Dinheiro ou Pix;
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
- Supabase Realtime preparado para entregas, localização e mensagens;
- service worker com cache do shell da PWA sem prender `config.js` em cache antigo.

## Backend preparado

`supabase/schema.sql` define:

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
- RLS em todas as tabelas expostas;
- políticas por papel e participação na entrega;
- Realtime nas tabelas operacionais necessárias;
- cadastro inicial sempre como `establishment`;
- nenhuma autorização baseada em `user_metadata`.

`supabase/verify.sql` contém consultas somente leitura para conferir tabelas, RLS, políticas, Realtime e configurações após a migração.

## Estado real atual

O código do backend está **preparado, mas a aplicação da migração no projeto novo ainda não está confirmada**. A conexão do Supabase ficou indisponível durante a tentativa de migração, então não se deve assumir que nenhuma tabela existe até uma leitura do projeto confirmar o estado.

Enquanto `supabasePublishableKey` permanecer vazia em `config.js`, o aplicativo continua no modo local, sem sincronização entre aparelhos.

## Próximas validações obrigatórias

1. recuperar a conexão com o projeto Supabase exclusivo;
2. listar tabelas/migrações antes de escrever qualquer coisa;
3. aplicar `schema.sql` somente se o banco estiver vazio/compatível;
4. executar `verify.sql`;
5. rodar advisors de segurança e performance;
6. recuperar a publishable key e ativar o modo remoto;
7. criar usuários de teste para `establishment`, `driver` e `admin`;
8. testar RLS com permissões permitidas e negadas;
9. testar pedido em dois aparelhos diferentes;
10. testar Realtime, chat e localização.

## GPS do motorista

A PWA consegue compartilhar GPS enquanto o navegador mantém a execução, porém **GPS contínuo em segundo plano não é confiável em PWA móvel** quando o motorista troca para outro aplicativo, bloqueia a tela ou entra na navegação.

Para a operação real, a recomendação é reutilizar a camada Flutter do `UrbGo` para um cliente mínimo de motorista do Vai e Vem, mantendo o Web/PWA para estabelecimentos e painel/admin.

## Ainda pendente no produto

- cálculo automático da distância por serviço de rotas;
- QR Code e Pix copia-e-cola completo;
- validação real do banco Supabase;
- publishable key do novo projeto;
- testes multiaparelho;
- rastreamento robusto do motorista em segundo plano via app móvel;
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

Nenhum segredo ou credencial dos projetos de origem deve ser copiado para este MVP.

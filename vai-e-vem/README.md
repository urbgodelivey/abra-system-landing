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

## Implementado nesta primeira base

- PWA mobile-first acessível por link;
- três visões no mesmo protótipo: estabelecimento, motorista e admin;
- criação de entrega;
- preço automático a partir de distância informada;
- valor mínimo + quilômetros incluídos + preço por km excedente;
- pagamento Dinheiro ou Pix;
- fluxo de status:
  - Solicitado;
  - Aceito;
  - Indo para coleta;
  - Pedido coletado;
  - Em entrega;
  - Entregue;
- abertura de navegação para coleta/destino;
- compartilhamento de GPS pelo navegador;
- mapa de localização do motorista;
- histórico;
- ganhos hoje / 7 dias / mês;
- chat vinculado ao pedido;
- painel com pedidos, localização e configuração de preço;
- manifest PWA e service worker mínimo;
- schema SQL preparado para um Supabase novo e isolado.

## Estado atual

O frontend usa `localStorage` como modo de demonstração funcional. Isso permite validar o fluxo em um aparelho/navegador sem depender de infraestrutura externa.

**Ainda não é o backend de produção.** LocalStorage não sincroniza dados entre o celular do estabelecimento e o celular do motorista.

## Próximo marco obrigatório

Criar um **novo projeto Supabase exclusivo do Vai e Vem** e ligar este frontend a:

- Supabase Auth;
- `profiles`;
- `deliveries`;
- `driver_locations`;
- `delivery_messages`;
- `pricing_config`;
- Supabase Realtime.

Somente após essa integração haverá pedidos e GPS realmente compartilhados entre dispositivos diferentes.

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

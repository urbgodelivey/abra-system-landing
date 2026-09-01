# Vai e Vem — Checklist de implantação segura

Este checklist existe para concluir a ativação do MVP sem tocar em nenhum repositório ou banco original da ArkGo/UrbGo/ABRA.

## 1. Supabase exclusivo

Projeto permitido:

- Project Ref: `zcwpxkwgxjkgaknhnscu`
- URL: `https://zcwpxkwgxjkgaknhnscu.supabase.co`

Nunca executar as migrações em outro projeto.

Ordem obrigatória:

1. listar tabelas e migrações atuais;
2. se o banco estiver vazio/compatível, aplicar `supabase/schema.sql`;
3. executar `supabase/verify.sql` somente como leitura;
4. rodar advisors de segurança e performance;
5. obter somente a publishable key ativa (nunca service_role/secret key);
6. colocar a publishable key em `config.js` ou em mecanismo público equivalente de deploy;
7. criar um usuário estabelecimento pelo fluxo normal de cadastro;
8. promover usuários específicos para `driver` e `admin` usando `supabase/bootstrap_roles.sql` de forma administrativa;
9. validar RLS de leitura/escrita para cada papel;
10. testar Realtime em `deliveries`, `driver_locations` e `delivery_messages`.

## 2. PWA

Diretório raiz de deploy: `vai-e-vem/`.

Arquivos de entrada:

- `index.html`
- `app.js`
- `styles.css`
- `supabase-client.js`
- `pix.js`
- `manifest.webmanifest`
- `sw.js`
- `vercel.json`

Teste mínimo após publicação:

1. abrir a URL HTTPS no celular;
2. confirmar instalação como PWA;
3. cadastrar estabelecimento;
4. criar entrega;
5. conferir preço calculado pelo backend;
6. abrir em outro aparelho com usuário motorista;
7. aceitar entrega;
8. confirmar atualização Realtime no estabelecimento;
9. enviar mensagem nos dois sentidos;
10. validar Pix copia-e-cola/QR quando configurado.

## 3. Driver Android

O módulo `driver/` é independente do UrbGo original. Antes de gerar APK:

1. completar/gerar o scaffold Flutter Android em uma cópia de trabalho;
2. usar a mesma URL do Supabase exclusivo;
3. fornecer somente publishable key via `--dart-define`/configuração segura de build;
4. garantir permissões de localização e foreground service;
5. criar canal persistente de notificação de rastreamento;
6. testar bloqueio de tela e troca para Google Maps/Waze;
7. testar retomada do app;
8. validar que GPS atualiza somente a linha do motorista autenticado por RLS.

## 4. Critério de pronto para uso real

O MVP só deve ser considerado operacional quando o teste ponta-a-ponta funcionar em dois aparelhos físicos:

**Estabelecimento cria → motorista recebe → motorista aceita → GPS aparece → status avança → chat sincroniza → entrega é concluída → histórico/ganhos atualizam.**

## 5. Regra de preservação

Nunca fazer merge dessas alterações para qualquer repositório original ArkGo/UrbGo/ABRA. O código do Vai e Vem deve ser migrado para um repositório próprio quando a criação desse repositório estiver disponível.

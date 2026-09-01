# Vai e Vem Motorista — Android/Flutter

Aplicativo mínimo e isolado para o motorista do Vai e Vem.

## Regra de isolamento

Este código foi criado dentro da branch `vai-e-vem-mvp` e não altera o repositório original `ArkGObr/UrbGo`.

A lógica reaproveitada do UrbGo foi reduzida ao necessário para o MVP:

- login do motorista;
- entregas pendentes;
- aceitar entrega;
- status `requested -> accepted -> going_to_pickup -> picked_up -> delivering -> delivered`;
- navegação para coleta e destino;
- histórico;
- ganhos de hoje, 7 dias e mês;
- GPS enviado para `driver_locations`;
- atualização em tempo real quando `deliveries` mudar.

Não foram trazidos:

- carteira/saldo;
- comissão;
- aprovação documental;
- categorias de veículo;
- marketplace por raio;
- ArkCoins/XP;
- Firebase/FCM;
- múltiplas modalidades.

## Backend permitido

Usar exclusivamente o Supabase do Vai e Vem:

`https://zcwpxkwgxjkgaknhnscu.supabase.co`

A publishable key deve entrar em build-time. Nunca versionar `service_role`, secret key, senha do banco ou credenciais privadas.

## Configuração de build

O ambiente usado por este agente não possui Flutter/Dart instalado, portanto o scaffold Android completo e a compilação APK ainda não puderam ser executados/validados aqui.

Em um ambiente com Flutter, dentro desta pasta:

```bash
flutter create . --platforms=android --org br.com.vaievem --project-name vai_e_vem_driver
flutter pub get
flutter analyze
flutter test
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://zcwpxkwgxjkgaknhnscu.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<CHAVE_PUBLICAVEL>
```

Após `flutter create`, preservar o `android/app/src/main/AndroidManifest.xml` versionado nesta pasta, pois ele contém as permissões necessárias ao rastreamento.

## GPS em segundo plano

O módulo usa `Geolocator.getPositionStream` com `AndroidSettings.foregroundNotificationConfig`, criando uma notificação persistente enquanto o compartilhamento estiver ativo. A documentação atual do Geolocator descreve esse modo como foreground service para manter a localização ativa quando o app sai do primeiro plano.

No primeiro uso, o Android ainda exige que o usuário conceda as permissões de localização apropriadas. Em Android 10+ a permissão de localização em segundo plano pode exigir uma etapa adicional nas configurações do sistema, dependendo da versão do Android.

## Dependência do banco

O app só ficará operacional depois que o `supabase/schema.sql` do projeto principal for validado/aplicado e o usuário do motorista tiver `profiles.role = 'driver'`.

## Próximos testes

1. compilar APK;
2. instalar em um Android de teste;
3. autenticar usuário com role `driver`;
4. criar entrega pelo PWA;
5. aceitar pelo app;
6. avançar todos os estados;
7. bloquear tela/abrir Google Maps e verificar atualização de `driver_locations`;
8. confirmar rastreamento no PWA do estabelecimento/admin;
9. validar consumo de bateria e intervalo de atualização em uso real.

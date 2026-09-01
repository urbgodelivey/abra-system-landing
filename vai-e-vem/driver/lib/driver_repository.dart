import 'dart:async';

import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const deliveryFlow = <String>[
  'requested',
  'accepted',
  'going_to_pickup',
  'picked_up',
  'delivering',
  'delivered',
];

class DriverRepository {
  DriverRepository(this.db);

  final SupabaseClient db;
  StreamSubscription<Position>? _locationSubscription;
  RealtimeChannel? _deliveryChannel;

  String get driverId {
    final user = db.auth.currentUser;
    if (user == null) throw StateError('Motorista não autenticado.');
    return user.id;
  }

  Future<Map<String, dynamic>> loadProfile() async {
    final row = await db.from('profiles').select().eq('id', driverId).single();
    if (row['role'] != 'driver' && row['role'] != 'admin') {
      throw StateError('Este usuário não está liberado como motorista.');
    }
    return Map<String, dynamic>.from(row);
  }

  Future<List<Map<String, dynamic>>> loadAvailable() async {
    final rows = await db
        .from('deliveries')
        .select()
        .eq('status', 'requested')
        .isFilter('driver_id', null)
        .order('created_at', ascending: true)
        .limit(30);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<Map<String, dynamic>>> loadMine() async {
    final rows = await db
        .from('deliveries')
        .select()
        .eq('driver_id', driverId)
        .order('created_at', ascending: false)
        .limit(100);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<void> accept(String deliveryId) async {
    final updated = await db
        .from('deliveries')
        .update({
          'driver_id': driverId,
          'status': 'accepted',
        })
        .eq('id', deliveryId)
        .eq('status', 'requested')
        .isFilter('driver_id', null)
        .select('id');

    if ((updated as List).isEmpty) {
      throw StateError('A entrega não está mais disponível.');
    }
  }

  Future<void> advance(Map<String, dynamic> delivery) async {
    final status = delivery['status'] as String;
    final index = deliveryFlow.indexOf(status);
    if (index < 1 || index >= deliveryFlow.length - 1) {
      throw StateError('A entrega não pode avançar a partir de $status.');
    }

    final next = deliveryFlow[index + 1];
    final updated = await db
        .from('deliveries')
        .update({'status': next})
        .eq('id', delivery['id'])
        .eq('driver_id', driverId)
        .eq('status', status)
        .select('id');

    if ((updated as List).isEmpty) {
      throw StateError('O status mudou em outro dispositivo. Atualize e tente novamente.');
    }
  }

  Future<void> cancel(String deliveryId) async {
    await db
        .from('deliveries')
        .update({'status': 'cancelled'})
        .eq('id', deliveryId)
        .eq('driver_id', driverId);
  }

  Future<Map<String, double>> earnings() async {
    final rows = await db
        .from('deliveries')
        .select('price, delivered_at')
        .eq('driver_id', driverId)
        .eq('status', 'delivered')
        .not('delivered_at', 'is', null)
        .order('delivered_at', ascending: false)
        .limit(500);

    final now = DateTime.now();
    double today = 0;
    double week = 0;
    double month = 0;

    for (final raw in rows as List) {
      final row = Map<String, dynamic>.from(raw as Map);
      final deliveredAt = DateTime.tryParse(row['delivered_at']?.toString() ?? '');
      if (deliveredAt == null) continue;
      final value = (row['price'] as num?)?.toDouble() ?? 0;
      final local = deliveredAt.toLocal();

      if (local.year == now.year && local.month == now.month && local.day == now.day) {
        today += value;
      }
      if (local.isAfter(now.subtract(const Duration(days: 7)))) week += value;
      if (local.year == now.year && local.month == now.month) month += value;
    }

    return {'today': today, 'week': week, 'month': month};
  }

  RealtimeChannel watchDeliveries(void Function() refresh) {
    _deliveryChannel?.unsubscribe();
    _deliveryChannel = db
        .channel('vai-e-vem-driver-deliveries')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'deliveries',
          callback: (_) => refresh(),
        )
        .subscribe();
    return _deliveryChannel!;
  }

  Future<void> startLocationTracking({required void Function(Position) onPosition}) async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) throw StateError('Ative a localização do aparelho.');

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw StateError('Permissão de localização negada.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw StateError('Permissão de localização bloqueada. Libere nas configurações do Android.');
    }

    await _locationSubscription?.cancel();

    const settings = AndroidSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 10,
      intervalDuration: Duration(seconds: 5),
      foregroundNotificationConfig: ForegroundNotificationConfig(
        notificationTitle: 'Vai e Vem em operação',
        notificationText: 'Sua localização está sendo compartilhada durante as entregas.',
        notificationChannelName: 'Rastreamento de entregas',
        enableWakeLock: true,
        setOngoing: true,
      ),
    );

    _locationSubscription = Geolocator.getPositionStream(locationSettings: settings).listen(
      (position) async {
        onPosition(position);
        try {
          final current = await currentDelivery();
          await db.from('driver_locations').upsert({
            'driver_id': driverId,
            'delivery_id': current?['id'],
            'lat': position.latitude,
            'lng': position.longitude,
            'accuracy_m': position.accuracy,
            'heading': position.heading,
            'speed_mps': position.speed,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          }, onConflict: 'driver_id');
        } catch (_) {
          // O stream continua ativo mesmo se uma atualização de rede falhar.
        }
      },
    );
  }

  Future<Map<String, dynamic>?> currentDelivery() async {
    final rows = await db
        .from('deliveries')
        .select()
        .eq('driver_id', driverId)
        .inFilter('status', ['accepted', 'going_to_pickup', 'picked_up', 'delivering'])
        .order('accepted_at', ascending: false)
        .limit(1);
    if ((rows as List).isEmpty) return null;
    return Map<String, dynamic>.from(rows.first as Map);
  }

  Future<void> stopLocationTracking() async {
    await _locationSubscription?.cancel();
    _locationSubscription = null;
  }

  Future<void> dispose() async {
    await stopLocationTracking();
    if (_deliveryChannel != null) await _deliveryChannel!.unsubscribe();
  }
}

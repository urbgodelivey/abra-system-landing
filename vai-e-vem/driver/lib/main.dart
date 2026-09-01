import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'driver_repository.dart';

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty) {
    await Supabase.initialize(url: supabaseUrl, anonKey: supabasePublishableKey);
  }

  runApp(const VaiEVemDriverApp());
}

class VaiEVemDriverApp extends StatelessWidget {
  const VaiEVemDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Vai e Vem Motorista',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFF7B500),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF080808),
        useMaterial3: true,
      ),
      home: supabaseUrl.isEmpty || supabasePublishableKey.isEmpty
          ? const MissingConfigScreen()
          : const AuthGate(),
    );
  }
}

class MissingConfigScreen extends StatelessWidget {
  const MissingConfigScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(
            child: Text(
              'Configuração do Supabase ausente. Compile usando --dart-define=SUPABASE_URL=... e --dart-define=SUPABASE_PUBLISHABLE_KEY=...',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late final StreamSubscription<AuthState> _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    return user == null ? const LoginScreen() : const DriverHome();
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  String? error;

  Future<void> submit() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: email.text.trim(),
        password: password.text,
      );
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.delivery_dining, size: 72, color: Color(0xFFF7B500)),
                  const SizedBox(height: 16),
                  Text('Vai e Vem', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
                  const Text('Motorista', textAlign: TextAlign.center),
                  const SizedBox(height: 28),
                  TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail', border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Senha', border: OutlineInputBorder())),
                  if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.redAccent))),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: loading ? null : submit, child: Text(loading ? 'Entrando...' : 'Entrar')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DriverHome extends StatefulWidget {
  const DriverHome({super.key});

  @override
  State<DriverHome> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHome> {
  late final DriverRepository repo;
  bool loading = true;
  bool tracking = false;
  String? message;
  List<Map<String, dynamic>> available = [];
  List<Map<String, dynamic>> mine = [];
  Map<String, double> totals = const {'today': 0, 'week': 0, 'month': 0};

  @override
  void initState() {
    super.initState();
    repo = DriverRepository(Supabase.instance.client);
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await repo.loadProfile();
      repo.watchDeliveries(() => refresh(silent: true));
      await refresh();
    } catch (e) {
      setState(() {
        loading = false;
        message = e.toString();
      });
    }
  }

  Future<void> refresh({bool silent = false}) async {
    if (!silent && mounted) setState(() => loading = true);
    try {
      final values = await Future.wait([
        repo.loadAvailable(),
        repo.loadMine(),
        repo.earnings(),
      ]);
      if (!mounted) return;
      setState(() {
        available = values[0] as List<Map<String, dynamic>>;
        mine = values[1] as List<Map<String, dynamic>>;
        totals = values[2] as Map<String, double>;
        loading = false;
        message = null;
      });
    } catch (e) {
      if (mounted) setState(() {
        loading = false;
        message = e.toString();
      });
    }
  }

  Map<String, dynamic>? get current {
    for (final delivery in mine) {
      if (const ['accepted', 'going_to_pickup', 'picked_up', 'delivering'].contains(delivery['status'])) return delivery;
    }
    return null;
  }

  Future<void> toggleTracking() async {
    try {
      if (tracking) {
        await repo.stopLocationTracking();
        setState(() => tracking = false);
      } else {
        await repo.startLocationTracking(onPosition: (_) {});
        setState(() => tracking = true);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> runAction(Future<void> Function() action) async {
    try {
      await action();
      await refresh(silent: true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  void dispose() {
    repo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vai e Vem Motorista'),
        actions: [
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: () => Supabase.instance.client.auth.signOut(), icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            FilledButton.icon(
              onPressed: toggleTracking,
              icon: Icon(tracking ? Icons.location_off : Icons.my_location),
              label: Text(tracking ? 'Parar compartilhamento de GPS' : 'Iniciar compartilhamento de GPS'),
              style: FilledButton.styleFrom(backgroundColor: tracking ? Colors.red.shade700 : const Color(0xFFF7B500), foregroundColor: tracking ? Colors.white : Colors.black),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _Kpi(label: 'Hoje', value: totals['today'] ?? 0)),
              const SizedBox(width: 8),
              Expanded(child: _Kpi(label: '7 dias', value: totals['week'] ?? 0)),
              const SizedBox(width: 8),
              Expanded(child: _Kpi(label: 'Mês', value: totals['month'] ?? 0)),
            ]),
            if (message != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(message!, style: const TextStyle(color: Colors.orangeAccent))),
            if (loading) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
            if (current != null) ...[
              const SizedBox(height: 22),
              Text('Entrega atual', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              DeliveryCard(delivery: current!, onAccept: null, onAdvance: () => runAction(() => repo.advance(current!))),
            ],
            const SizedBox(height: 22),
            Text('Novas solicitações', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            if (available.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 22), child: Text('Nenhuma entrega aguardando.')),
            ...available.map((delivery) => DeliveryCard(delivery: delivery, onAccept: current == null ? () => runAction(() => repo.accept(delivery['id'].toString())) : null, onAdvance: null)),
            const SizedBox(height: 22),
            Text('Histórico recente', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            ...mine.where((d) => d['status'] == 'delivered').take(20).map((delivery) => DeliveryCard(delivery: delivery, onAccept: null, onAdvance: null)),
          ],
        ),
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value});
  final String label;
  final double value;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(value);
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [Text(label), const SizedBox(height: 4), FittedBox(child: Text(money, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)))])));
  }
}

class DeliveryCard extends StatelessWidget {
  const DeliveryCard({super.key, required this.delivery, this.onAccept, this.onAdvance});
  final Map<String, dynamic> delivery;
  final VoidCallback? onAccept;
  final VoidCallback? onAdvance;

  String get status => delivery['status']?.toString() ?? 'requested';

  String statusLabel(String value) => const {
    'requested': 'Solicitado',
    'accepted': 'Aceito',
    'going_to_pickup': 'Indo para coleta',
    'picked_up': 'Pedido coletado',
    'delivering': 'Em entrega',
    'delivered': 'Entregue',
    'cancelled': 'Cancelado',
  }[value] ?? value;

  String? nextLabel() {
    final index = deliveryFlow.indexOf(status);
    if (index < 1 || index >= deliveryFlow.length - 1) return null;
    return statusLabel(deliveryFlow[index + 1]);
  }

  Future<void> navigate(String? address) async {
    if (address == null || address.trim().isEmpty) return;
    final uri = Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': address});
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final amount = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format((delivery['price'] as num?)?.toDouble() ?? 0);
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Expanded(child: Text('VV-${delivery['id'].toString().substring(0, 6).toUpperCase()}', style: const TextStyle(fontWeight: FontWeight.w900))), Chip(label: Text(statusLabel(status)))]),
          Text('Coleta: ${delivery['pickup_address'] ?? ''}'),
          const SizedBox(height: 5),
          Text('Destino: ${delivery['delivery_address'] ?? ''}'),
          const SizedBox(height: 8),
          Text('$amount · ${delivery['distance_km'] ?? 0} km', style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(onPressed: () => navigate(delivery['pickup_address']?.toString()), icon: const Icon(Icons.store_mall_directory), label: const Text('Coleta')),
            OutlinedButton.icon(onPressed: () => navigate(delivery['delivery_address']?.toString()), icon: const Icon(Icons.flag), label: const Text('Destino')),
            if (onAccept != null) FilledButton(onPressed: onAccept, child: const Text('Aceitar')),
            if (onAdvance != null) FilledButton(onPressed: onAdvance, child: Text(nextLabel() ?? 'Avançar')),
          ]),
        ]),
      ),
    );
  }
}

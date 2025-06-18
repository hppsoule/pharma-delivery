import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import medicineRoutes from './routes/medicines.js';
import pharmacyRoutes from './routes/pharmacies.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payments.js';
import deliveryRoutes from './routes/deliveries.js';

// Import database
import pool, { testConnection } from './config/database.js';

dotenv.config();

const allowedOrigins = [
  'http://localhost:5173',
  'https://pharma-delivery.vercel.app'
];

const app = express();
const server = createServer(app);

// ✅ Socket.IO avec origine autorisée
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// ✅ Sécurité & limites
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());

// ✅ CORS dynamique selon origine autorisée
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true
}));

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Injecter Socket.IO dans les requêtes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ Routes API
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/deliveries', deliveryRoutes);

// ✅ Route de test
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    message: 'Serveur PharmaDelivery opérationnel'
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, COUNT(*) as user_count FROM users');
    res.json({
      status: 'OK',
      database: 'Connected',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// ✅ Middleware de gestion d’erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);

  if (err.isJoi) {
    return res.status(400).json({
      error: 'Erreur de validation',
      details: err.details.map(detail => detail.message)
    });
  }

  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({
      error: 'Erreur de base de données',
      message: 'Données invalides ou conflit'
    });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur' 
      : err.message || 'Erreur interne du serveur'
  });
});

// ✅ 404 - route non trouvée
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// ✅ Socket.IO événements
io.on('connection', (socket) => {
  console.log('✅ Utilisateur connecté:', socket.id);

  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 Utilisateur ${userId} a rejoint sa room`);
  });

  socket.on('update_driver_location', async (data) => {
    try {
      const { driverId, latitude, longitude } = data;

      await pool.query(`
        INSERT INTO driver_locations (driver_id, latitude, longitude, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (driver_id)
        DO UPDATE SET latitude = $2, longitude = $3, updated_at = CURRENT_TIMESTAMP
      `, [driverId, latitude, longitude]);

      const activeOrders = await pool.query(`
        SELECT patient_id, id as order_id
        FROM orders
        WHERE driver_id = $1 AND status = 'in_transit'
      `, [driverId]);

      activeOrders.rows.forEach(order => {
        io.to(`user_${order.patient_id}`).emit('driver_location_update', {
          orderId: order.order_id,
          driverLocation: { lat: latitude, lng: longitude }
        });
      });
    } catch (error) {
      console.error('❌ Erreur de mise à jour de localisation:', error);
    }
  });

  socket.on('order_status_update', (data) => {
    const { orderId, status, patientId, pharmacistId, driverId } = data;

    if (patientId) io.to(`user_${patientId}`).emit('order_status_changed', { orderId, status });
    if (pharmacistId) io.to(`user_${pharmacistId}`).emit('order_status_changed', { orderId, status });
    if (driverId) io.to(`user_${driverId}`).emit('order_status_changed', { orderId, status });
  });

  socket.on('delivery_accepted', (data) => {
    const { orderId, driverId, patientId, pharmacistId } = data;

    if (patientId) io.to(`user_${patientId}`).emit('delivery_accepted', { orderId, driverId });
    if (pharmacistId) io.to(`user_${pharmacistId}`).emit('delivery_accepted', { orderId, driverId });
  });

  socket.on('disconnect', () => {
    console.log('🚫 Utilisateur déconnecté:', socket.id);
  });
});

// ✅ Lancement serveur avec vérification DB
const startServer = async () => {
  console.log('🟢 Démarrage du serveur...');

  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error('❌ Connexion base de données échouée.');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`🚀 Serveur prêt sur le port ${PORT}`);
    console.log(`🌍 Frontend autorisé: ${process.env.FRONTEND_URL}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
  });
};

// ✅ Fermeture propre du serveur
process.on('SIGTERM', async () => {
  console.log('⛔ SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    pool.end(() => {
      console.log('✅ Connexions fermées.');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('⛔ SIGINT reçu, arrêt du serveur...');
  server.close(() => {
    pool.end(() => {
      console.log('✅ Connexions fermées.');
      process.exit(0);
    });
  });
});

startServer().catch(error => {
  console.error('❌ Erreur au démarrage:', error);
  process.exit(1);
});

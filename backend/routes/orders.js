import express from 'express';
import { createOrder, getOrders, getOrderById, updateOrderStatus, updateOrderPrescription, assignDriver } from '../controllers/orderController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';

const router = express.Router();

router.post('/', authenticateToken, requireRole(['patient']), validateRequest(schemas.createOrder), createOrder);
router.get('/', authenticateToken, getOrders);
router.get('/:orderId', authenticateToken, getOrderById);
router.patch('/:orderId/status', authenticateToken, requireRole(['pharmacist', 'driver', 'admin']), validateRequest(schemas.updateOrderStatus), updateOrderStatus);
router.patch('/:orderId/prescription', authenticateToken, requireRole(['patient']), validateRequest(schemas.updateOrderPrescription), updateOrderPrescription);
// Nouvelle route pour assigner un livreur à une commande - Restreinte aux pharmaciens et admins
router.post('/:orderId/assign-driver', authenticateToken, requireRole(['pharmacist', 'admin']), validateRequest(schemas.assignDriver), assignDriver);

export default router;
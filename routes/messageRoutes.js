// routes/messageRoutes.js
import express from 'express';
import { handleIncomingRequest } from '../controllers/requestController.js';

const router = express.Router();

router.post('/', handleIncomingRequest);

export default router;

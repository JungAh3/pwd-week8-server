import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import * as controller from '../controllers/restaurants.controller';

const router = Router();

router.get('/', controller.list);
router.get('/popular', controller.popular);
router.get('/:id', controller.get);

router.post('/', isAuthenticated, controller.create);
router.put('/:id', isAuthenticated, controller.update);
router.delete('/:id', isAuthenticated, controller.remove);

export default router;
import { Router } from 'express';
import { createJob, getJobs, getJob, updateJob, deleteJob } from '../controllers/jobController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.use(protect);

router.post('/', createJob);
router.get('/', getJobs);
router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

export default router;

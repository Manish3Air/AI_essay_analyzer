import express from 'express';
import multer from 'multer';
import {
  analyzeEssay,
  clearEssayHistory,
  deleteEssay,
  getEssayHistory,
  saveAnnotationFeedback,
} from "../controllers/analyzeController.js";
import { analyzeEssayML } from "../controllers/analyzeessayml.js";
import Essay from '../models/essay.js';


const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// POST /api/essay/analyze -> accepts form-data file or JSON { text }
router.post('/analyze', upload.single('file'), analyzeEssay);
router.post('/analyze-ml', upload.single('file'), analyzeEssayML);
router.get("/history", getEssayHistory);
router.delete("/history", clearEssayHistory);
router.delete("/:id", deleteEssay);

// GET /api/essay/history/:userId -> list of essays
router.get('/history/:userId', async (req,res)=>{
try { const docs = await Essay.find({ userId: req.params.userId }).sort({ createdAt:-1 }).limit(50); res.json(docs); }
catch(e){ res.status(500).json({error:e.message}); }
});


// GET /api/essay/:id -> return saved essay + analysis
router.get('/:id', async (req,res)=>{
try { const doc = await Essay.findById(req.params.id); if(!doc) return res.status(404).json({error:'Not found'}); res.json(doc); }
catch(e){ res.status(500).json({error:e.message}); }
});

router.post("/annotation-feedback", saveAnnotationFeedback);




export default router;

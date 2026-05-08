
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import essayRoutes from './routes/essayRoutes.js';
const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));


// connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri)
.then(()=> console.log('✅ MongoDB connected'))
.catch(err => console.error('MongoDB connection error', err));


app.use('/api/essay', essayRoutes);


app.get('/', (req, res) => res.json({ status: 'AI Essay Analyzer backend v3 running' }));


const PORT = process.env.PORT;
app.listen(PORT, ()=> console.log(`🚀 Backend running on port ${PORT}`));

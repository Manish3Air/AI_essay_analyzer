import axios from 'axios';
const api = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000' });


export const analyzeFile = (formData) => api.post('/api/essay/analyze', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
export const analyzeText = (payload) => api.post('/api/essay/analyze', payload, { timeout: 180000 });
export const getEssay = (id) => api.get(`/api/essay/${id}`);
export const getHistory = (userId) => api.get(`/api/essay/history/${userId}`);


export default api;
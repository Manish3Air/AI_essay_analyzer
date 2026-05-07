AI Essay Analyzer v2 — React + Node.js

What's new in v2:
- Inline highlights for grammar corrections and suggestions (hover to see notes)
- Animated score meter
- Styled PDF report using jsPDF + autoTable
- Theme: auto / light / dark toggle, and subtle animations via Framer Motion

Setup:
1. Backend:
   cd backend
   npm install
   copy .env.example to .env and add OPENAI_API_KEY
   npm start

2. Frontend:
   cd frontend
   npm install
   npm start

Notes:
- The backend requests 'annotations' from the model. If the model doesn't return annotations in the exact schema, frontend will still display corrected_text and lists.
- Adjust model name or SDK calls if your OpenAI package version differs.

# AI Essay Analyzer v2

An AI-powered essay evaluation platform built with **React**, **Node.js**, and **Python-based Machine Learning utilities**. The application analyzes essays for grammar, readability, structure, tone, and overall writing quality using modern AI models and NLP techniques.

---

# Features

## Core Features

* AI-powered essay analysis and feedback
* Grammar correction suggestions
* Readability and writing quality scoring
* Essay improvement recommendations
* Real-time frontend interaction
* Responsive and modern UI

## v2 Enhancements

* Inline grammar highlights with hover-based explanations
* Animated score meter for visual feedback
* Professional PDF report generation using jsPDF + autoTable
* Theme support:

  * Light Mode
  * Dark Mode
  * Auto/System Theme
* Smooth animations with Framer Motion
* Improved UI responsiveness and accessibility

## Machine Learning Module

The project also includes a dedicated **ML folder** containing Python-based machine learning and NLP utilities.

Possible functionalities include:

* Text preprocessing
* NLP pipelines
* Essay scoring experiments
* Sentiment or emotion analysis
* Model training/testing scripts
* Custom ML evaluation workflows

---

# Tech Stack

## Frontend

* React.js
* Tailwind CSS
* Framer Motion
* jsPDF
* autoTable

## Backend

* Node.js
* Express.js
* OpenAI API

## Machine Learning

* Python
* NLP/ML Libraries (depending on implementation)

---

# Project Structure

```bash
AI_Analyzer/
│
├── frontend/          # React frontend
├── backend/           # Node.js + Express backend
├── ml/                # Python machine learning/NLP scripts
├── README.md
└── .gitignore
```

---

# Installation & Setup

## 1. Clone the Repository

```bash
git clone https://github.com/Manish3Air/AI_essay_analyzer.git
cd AI_Analyzer
```

---

# Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your_api_key_here
```

Start the backend server:

```bash
npm start
```

---

# Frontend Setup

```bash
cd frontend
npm install
npm start
```

The frontend will typically run on:

```bash
http://localhost:3000
```

---

# ML Module Setup

Navigate to the ML folder:

```bash
cd ml
```

Create a virtual environment (recommended):

```bash
python -m venv venv
```

Activate environment:

### Windows

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run Python scripts:

```bash
python filename.py
```

---

# PDF Report Generation

The application generates professional essay reports including:

* Essay score
* Grammar feedback
* Suggestions
* Writing insights
* Corrected content

Libraries used:

* jsPDF
* autoTable

---

# Theme Support

Users can switch between:

* Light Theme
* Dark Theme
* System Theme

Theme transitions are animated for a smoother user experience.

---

# Important Notes

* The backend requests structured `annotations` from the AI model.
* If annotations are not returned exactly in schema format, the frontend still gracefully displays:

  * corrected text
  * suggestions
  * grammar improvements
* Depending on your OpenAI SDK version, minor API adjustments may be required.
* Never commit your `.env` file or API keys to GitHub.

---

# Security

Make sure the following files are included in `.gitignore`:

```gitignore
.env
backend/.env
node_modules
venv
__pycache__
```

---

# Future Improvements

* Essay plagiarism detection
* AI-based essay scoring models
* Multi-language support
* Advanced NLP analytics
* User authentication
* Cloud deployment
* Export reports in multiple formats

---

# Author

Developed by Manish Pandey.

---

# License

This project is open-source and available for learning and development

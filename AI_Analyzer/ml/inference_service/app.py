# ml/inference_service/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import torch

from transformers import (
    T5TokenizerFast,
    T5ForConditionalGeneration,
    AutoTokenizer,
    AutoModelForSequenceClassification,
)

app = FastAPI(title="Essay Analyzer ML Service")

# -----------------------------
# CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with frontend/backend domains later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Device
# -----------------------------
device = torch.device("cpu")

# -----------------------------
# Hugging Face Repositories
# -----------------------------
GRAMMAR_REPO = "Manish3Air/essay-grammar"
TONE_REPO = "Manish3Air/essay-tone"
SCORE_REPO = "Manish3Air/essay-score"

# -----------------------------
# Lazy Loaded Models
# -----------------------------
grammar_tokenizer = None
grammar_model = None

tone_tokenizer = None
tone_model = None

score_tokenizer = None
score_model = None


# -----------------------------
# Load Grammar Model
# -----------------------------
def load_grammar():
    global grammar_tokenizer, grammar_model

    if grammar_model is None:
        print("Loading Grammar Model...")

        grammar_tokenizer = T5TokenizerFast.from_pretrained(
            GRAMMAR_REPO
        )

        grammar_model = T5ForConditionalGeneration.from_pretrained(
            GRAMMAR_REPO
        )

        grammar_model.to(device)
        grammar_model.eval()

        print("Grammar Model Loaded")


# -----------------------------
# Load Tone Model
# -----------------------------
def load_tone():
    global tone_tokenizer, tone_model

    if tone_model is None:
        print("Loading Tone Model...")

        tone_tokenizer = AutoTokenizer.from_pretrained(
            TONE_REPO
        )

        tone_model = AutoModelForSequenceClassification.from_pretrained(
            TONE_REPO
        )

        tone_model.to(device)
        tone_model.eval()

        print("Tone Model Loaded")


# -----------------------------
# Load Score Model
# -----------------------------
def load_score():
    global score_tokenizer, score_model

    if score_model is None:
        print("Loading Score Model...")

        score_tokenizer = AutoTokenizer.from_pretrained(
            SCORE_REPO
        )

        score_model = AutoModelForSequenceClassification.from_pretrained(
            SCORE_REPO
        )

        score_model.to(device)
        score_model.eval()

        print("Score Model Loaded")


# -----------------------------
# Request Schema
# -----------------------------
class TextIn(BaseModel):
    text: str


# -----------------------------
# Health Route
# -----------------------------
@app.get("/")
def home():
    return {
        "message": "Essay Analyzer ML Service Running"
    }


# -----------------------------
# Grammar Endpoint
# -----------------------------
@app.post("/grammar")
def grammar(payload: TextIn):

    try:
        load_grammar()

        text = "correct: " + payload.text.strip()

        inputs = grammar_tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=256
        )

        inputs = {
            key: value.to(device)
            for key, value in inputs.items()
        }

        with torch.no_grad():

            output = grammar_model.generate(
                **inputs,
                max_length=256,
                num_beams=5,
                early_stopping=True,
                no_repeat_ngram_size=2,
            )

        corrected = grammar_tokenizer.decode(
            output[0],
            skip_special_tokens=True
        )

        return {
            "corrected_text": corrected
        }

    except Exception as e:

        return {
            "error": str(e)
        }


# -----------------------------
# Tone Endpoint
# -----------------------------
@app.post("/tone")
def tone(payload: TextIn):

    try:
        load_tone()

        inputs = tone_tokenizer(
            payload.text,
            return_tensors="pt",
            truncation=True,
            max_length=256
        )

        inputs = {
            key: value.to(device)
            for key, value in inputs.items()
        }

        with torch.no_grad():

            logits = tone_model(**inputs).logits

        probs = torch.softmax(
            logits,
            dim=-1
        ).tolist()[0]

        label_id = int(
            torch.argmax(logits, dim=-1)
        )

        label_map = {
            0: "formal",
            1: "informal",
            2: "neutral"
        }

        return {
            "tone": label_map[label_id],
            "probabilities": probs,
        }

    except Exception as e:

        return {
            "error": str(e)
        }


# -----------------------------
# Score Endpoint
# -----------------------------
@app.post("/score")
def score(payload: TextIn):

    try:
        load_score()

        inputs = score_tokenizer(
            payload.text,
            return_tensors="pt",
            truncation=True,
            max_length=512
        )

        inputs = {
            key: value.to(device)
            for key, value in inputs.items()
        }

        with torch.no_grad():

            raw = score_model(**inputs).logits.item()

        score_10 = max(
            0.0,
            min(10.0, raw * 10)
        )

        return {
            "score": round(score_10, 2)
        }

    except Exception as e:

        return {
            "error": str(e)
        }


# -----------------------------
# Combined Analyze Endpoint
# -----------------------------
@app.post("/analyze")
def analyze(payload: TextIn):

    try:

        grammar_result = grammar(payload)
        tone_result = tone(payload)
        score_result = score(payload)

        return {
            "grammar": grammar_result,
            "tone": tone_result,
            "score": score_result,
        }

    except Exception as e:

        return {
            "error": str(e)
        }
# ml/inference/app.py

from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import (
    T5TokenizerFast,
    T5ForConditionalGeneration,
    AutoTokenizer,
    AutoModelForSequenceClassification,
)

app = FastAPI(title="Essay Analyzer ML Service")

GRAMMAR_REPO = "Manish3Air/essay-grammar"
TONE_REPO    = "Manish3Air/essay-tone"
SCORE_REPO   = "Manish3Air/essay-score"

grammar_tokenizer = grammar_model = None
tone_tokenizer = tone_model = None
score_tokenizer = score_model = None


def load_grammar():
    global grammar_tokenizer, grammar_model
    if grammar_model is None:
        grammar_tokenizer = T5TokenizerFast.from_pretrained(GRAMMAR_REPO)
        grammar_model = T5ForConditionalGeneration.from_pretrained(GRAMMAR_REPO)
        grammar_model.eval()


def load_tone():
    global tone_tokenizer, tone_model
    if tone_model is None:
        tone_tokenizer = AutoTokenizer.from_pretrained(TONE_REPO)
        tone_model = AutoModelForSequenceClassification.from_pretrained(TONE_REPO)
        tone_model.eval()


def load_score():
    global score_tokenizer, score_model
    if score_model is None:
        score_tokenizer = AutoTokenizer.from_pretrained(SCORE_REPO)
        score_model = AutoModelForSequenceClassification.from_pretrained(SCORE_REPO)
        score_model.eval()


class TextIn(BaseModel):
    text: str


@app.post("/grammar")
def grammar(payload: TextIn):
    load_grammar()

    text = "correct: " + payload.text.strip()

    inputs = grammar_tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=256
    )

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

    return {"corrected_text": corrected}


@app.post("/tone")
def tone(payload: TextIn):
    load_tone()

    inputs = tone_tokenizer(
        payload.text,
        return_tensors="pt",
        truncation=True,
        max_length=256
    )

    with torch.no_grad():
        logits = tone_model(**inputs).logits

    probs = torch.softmax(logits, dim=-1).tolist()[0]
    label_id = int(torch.argmax(logits, dim=-1))

    label_map = {0: "formal", 1: "informal", 2: "neutral"}

    return {
        "tone": label_map[label_id],
        "probabilities": probs,
    }


@app.post("/score")
def score(payload: TextIn):
    load_score()

    inputs = score_tokenizer(
        payload.text,
        return_tensors="pt",
        truncation=True,
        max_length=512
    )

    with torch.no_grad():
        raw = score_model(**inputs).logits.item()

    score_10 = max(0.0, min(10.0, raw * 10))
    return {"score": round(score_10, 2)}


@app.post("/analyze")
def analyze(payload: TextIn):
    return {
        "grammar": grammar(payload),
        "tone": tone(payload),
        "score": score(payload),
    }

@app.get("/")
def home():
    return {"message": "Essay Analyzer ML Service Running"}    

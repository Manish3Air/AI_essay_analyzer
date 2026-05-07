# ml/train/train_score.py

import json
import random
import numpy as np
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
import evaluate


# ---------------------------
# Load JSONL safely
# ---------------------------
def load_jsonl(path):
    items = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


# ---------------------------
# Load & split data
# ---------------------------
data = load_jsonl("ml/data/score_train.jsonl")
assert len(data) > 0, "Score dataset is empty!"

random.shuffle(data)

split_idx = max(1, int(0.8 * len(data)))
train_data = data[:split_idx]
val_data = data[split_idx:]

print(f"Train samples: {len(train_data)}")
print(f"Val samples: {len(val_data)}")

train_ds = Dataset.from_list(train_data)
val_ds = Dataset.from_list(val_data)


# ---------------------------
# Tokenizer
# ---------------------------
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")


def preprocess(batch):
    enc = tokenizer(
        batch["text"],
        truncation=True,
        padding="max_length",
        max_length=256,
    )
    # Normalize score 0–10 → 0–1
    enc["labels"] = [s / 10.0 for s in batch["score"]]
    return enc


train_ds = train_ds.map(preprocess, batched=True)
val_ds = val_ds.map(preprocess, batched=True)

train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
val_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])


# ---------------------------
# Model (REGRESSION)
# ---------------------------
model = AutoModelForSequenceClassification.from_pretrained(
    "bert-base-uncased",
    num_labels=1,
    problem_type="regression",
)


# ---------------------------
# Metrics (optional but useful)
# ---------------------------
mse = evaluate.load("mse")

def compute_metrics(eval_pred):
    preds, labels = eval_pred
    return mse.compute(predictions=preds.flatten(), references=labels.flatten())


# ---------------------------
# Training args (SAFE)
# ---------------------------
training_args = TrainingArguments(
    output_dir="ml/outputs/score-bert",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=8,
    logging_steps=50,
    save_total_limit=2,
    report_to="none",
)


# ---------------------------
# Train
# ---------------------------
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    compute_metrics=compute_metrics,
)

trainer.train()

trainer.save_model("ml/outputs/score-bert-final")
tokenizer.save_pretrained("ml/outputs/score-bert-final")

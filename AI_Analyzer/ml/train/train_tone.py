# ml/train_tone.py

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
data = load_jsonl("ml/data/tone_train.jsonl")
assert len(data) > 0, "Tone dataset is empty!"

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
tokenizer = AutoTokenizer.from_pretrained("roberta-base")


def preprocess(batch):
    enc = tokenizer(
        batch["text"],
        truncation=True,
        padding="max_length",
        max_length=128,
    )
    enc["labels"] = batch["label"]
    return enc


train_ds = train_ds.map(preprocess, batched=True)
val_ds = val_ds.map(preprocess, batched=True)

train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
val_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])


# ---------------------------
# Model (label-safe)
# ---------------------------
label2id = {"formal": 0, "informal": 1, "neutral": 2}
id2label = {0: "formal", 1: "informal", 2: "neutral"}

model = AutoModelForSequenceClassification.from_pretrained(
    "roberta-base",
    num_labels=3,
    label2id=label2id,
    id2label=id2label,
)


# ---------------------------
# Metrics
# ---------------------------
metric = evaluate.load("accuracy")

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return metric.compute(predictions=preds, references=labels)


# ---------------------------
# Training args (SAFE)
# ---------------------------
training_args = TrainingArguments(
    output_dir="ml/outputs/tone-roberta",
    num_train_epochs=3,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=16,
    logging_steps=50,
    save_total_limit=2,
    report_to="none",  # 🚫 disables wandb prompt
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

trainer.save_model("ml/outputs/tone-roberta-final")
tokenizer.save_pretrained("ml/outputs/tone-roberta-final")

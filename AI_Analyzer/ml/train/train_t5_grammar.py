# ml/train_t5_grammar.py

import random
import re
from datasets import Dataset, load_dataset, concatenate_datasets



from transformers import (
    T5TokenizerFast,
    T5ForConditionalGeneration,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
)
import evaluate


# ---------------------------
# Text normalization
# ---------------------------
def normalize(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


# ---------------------------
# Load Tier-1 datasets
# ---------------------------
ow_ds = load_dataset("Owishiboo/grammar-correction")["train"]
# jf_ds = load_dataset("jfleg")["validation"]
jf_raw = load_dataset("jfleg")
jf_ds = concatenate_datasets([
    jf_raw["validation"],
    jf_raw["test"]
])






# ---------------------------
# Clean Owishiboo (PRIMARY)
# ---------------------------
ow_clean = []
for x in ow_ds:
    src = normalize(x["input"])
    tgt = normalize(x["target"])

    if not src or not tgt:
        continue
    if src == tgt:
        continue
    if len(src.split()) < 4 or len(src.split()) > 40:
        continue

    ow_clean.append({
        "input_text": "correct: " + src,
        "target_text": tgt,
    })

print("Owishiboo clean:", len(ow_clean))


# ---------------------------
# Clean JFLEG (FLUENCY)
# ---------------------------
jf_clean = []
for x in jf_ds:
    src = normalize(x["sentence"])
    tgt = normalize(x["corrections"][0])  # first reference only

    if not src or not tgt:
        continue
    if src == tgt:
        continue
    if len(src.split()) < 5 or len(src.split()) > 35:
        continue

    jf_clean.append({
        "input_text": "correct: " + src,
        "target_text": tgt,
    })

print("JFLEG clean:", len(jf_clean))


# ---------------------------
# Weighted Tier-1 mixing
# Ratio: Owishiboo : JFLEG : FCE = 4 : 1 : 1
# ---------------------------
jf_sample = random.sample(jf_clean, min(len(jf_clean), len(ow_clean) // 4))

final_data = ow_clean * 4 + jf_sample 
random.shuffle(final_data)

print("Final dataset size:", len(final_data))
assert len(final_data) > 0, "❌ No training data after mixing!"


# ---------------------------
# Train / Val split (90 / 10)
# ---------------------------
split_idx = int(0.9 * len(final_data))
train_data = final_data[:split_idx]
val_data = final_data[split_idx:]

train_ds = Dataset.from_list(train_data)
val_ds = Dataset.from_list(val_data)

print("Train samples:", len(train_ds))
print("Val samples:", len(val_ds))


# ---------------------------
# Model & tokenizer
# ---------------------------
model_name = "t5-small"
tokenizer = T5TokenizerFast.from_pretrained(model_name)
model = T5ForConditionalGeneration.from_pretrained(model_name)

MAX_INPUT = 256
MAX_TARGET = 128


# ---------------------------
# Tokenization
# ---------------------------
def preprocess(batch):
    inputs = tokenizer(
        batch["input_text"],
        truncation=True,
        padding="max_length",
        max_length=MAX_INPUT,
    )

    targets = tokenizer(
        batch["target_text"],
        truncation=True,
        padding="max_length",
        max_length=MAX_TARGET,
    )

    labels = targets["input_ids"]
    labels = [
        [(l if l != tokenizer.pad_token_id else -100) for l in label]
        for label in labels
    ]

    inputs["labels"] = labels
    return inputs


train_ds = train_ds.map(preprocess, batched=True)
val_ds = val_ds.map(preprocess, batched=True)

print("Train columns:", train_ds.column_names)


# ---------------------------
# Training setup
# ---------------------------
data_collator = DataCollatorForSeq2Seq(tokenizer, model=model)
rouge = evaluate.load("rouge")

training_args = Seq2SeqTrainingArguments(
    output_dir="ml/outputs/t5-grammar",
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    num_train_epochs=4,
    learning_rate=2e-5,
    predict_with_generate=True,
    logging_steps=100,
    save_total_limit=2,
    fp16=False,
    optim="adamw_torch",
)


# ---------------------------
# Metrics
# ---------------------------
def compute_metrics(eval_pred):
    preds, labels = eval_pred

    labels = [
        [(l if l != -100 else tokenizer.pad_token_id) for l in label]
        for label in labels
    ]

    decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
    decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

    result = rouge.compute(predictions=decoded_preds, references=decoded_labels)

    return {
        "rouge1": result["rouge1"].mid.fmeasure,
        "rougeL": result["rougeL"].mid.fmeasure,
    }


# ---------------------------
# Train
# ---------------------------
trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    tokenizer=tokenizer,
    data_collator=data_collator,
    compute_metrics=compute_metrics,
)

trainer.train()

trainer.save_model("ml/outputs/t5-grammar-final")
tokenizer.save_pretrained("ml/outputs/t5-grammar-final")

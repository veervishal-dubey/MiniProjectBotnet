import sys
import time
import json
import copy
from pathlib import Path
import numpy as np
import torch
from sklearn.metrics import f1_score, accuracy_score

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(REPO_ROOT / "federated"))
import fl_core

print("=== STARTING 5-CLIENT, 5-ROUND, 1-LOCAL-EPOCH FEDERATED EXPERIMENT ===")
cache_dir = REPO_ROOT / "federated" / "cache"
splits_dir = REPO_ROOT / "federated" / "splits"

X_clean = np.load(cache_dir / "X_clean.npy", mmap_mode="r")
y_clean = np.load(cache_dir / "y_clean.npy", mmap_mode="r")
splits = np.load(splits_dir / "A_iid.npz")

NUM_CLIENTS = 5
ROUNDS = 5
LOCAL_EPOCHS = 1
BATCH_SIZE = 512
LR = 0.001
MAX_SAMPLES = 5000  # 5000 samples per client

client_train_idx = [splits[f"c{k}_train"][:MAX_SAMPLES] for k in range(NUM_CLIENTS)]
test_idx = splits["test"][:MAX_SAMPLES]

# 1. Federated Standardization (privacy-preserving local aggregation)
t0 = time.time()
stats = [fl_core.local_stats(X_clean[idx]) for idx in client_train_idx]
mean, std, total_n = fl_core.aggregate_stats(stats)
print(f"Federated standardization aggregated across {total_n} samples in {time.time()-t0:.2f}s")

# Pre-transform test split for central evaluation
X_test = fl_core.transform(X_clean[test_idx], mean, std)
y_test = y_clean[test_idx]

# 2. Server initializes global model
fl_core.set_seed(42)
global_model = fl_core.FLMLP()
global_weights = copy.deepcopy(global_model.state_dict())

initial_eval, preds = fl_core.evaluate(global_model, X_test, y_test)
init_acc = accuracy_score(y_test, preds)
init_f1 = f1_score(y_test, preds, average="macro", zero_division=0)
print(f"Round 0 (Initial Global Model): Loss={initial_eval['loss']:.4f}, Acc={init_acc*100:.2f}%, MacroF1={init_f1*100:.2f}%")

history = []
param_size_bytes = sum(p.numel() * p.element_size() for p in global_model.parameters())
print(f"Model parameter size: {param_size_bytes} bytes ({param_size_bytes/1024:.1f} KB)")

for r in range(1, ROUNDS + 1):
    r_start = time.time()
    client_weights = []
    client_counts = []
    client_losses = []
    client_accs = []

    # Client local training phase
    for k in range(NUM_CLIENTS):
        c_model = fl_core.FLMLP()
        c_model.load_state_dict(global_weights)

        X_k = fl_core.transform(X_clean[client_train_idx[k]], mean, std)
        y_k = y_clean[client_train_idx[k]]

        res = fl_core.train_local(
            model=c_model,
            X=X_k,
            y=y_k,
            epochs=LOCAL_EPOCHS,
            batch_size=BATCH_SIZE,
            lr=LR,
            seed=42 + r * 10 + k,
        )
        client_weights.append(copy.deepcopy(c_model.state_dict()))
        client_counts.append(res["num-examples"])
        client_losses.append(res["train_loss"])
        client_accs.append(res["train_acc"])

    # Server aggregation: FedAvg (sample-weighted)
    agg_start = time.time()
    global_weights = fl_core.weighted_average(client_weights, client_counts)
    agg_dur = time.time() - agg_start
    global_model.load_state_dict(global_weights)

    # Server evaluation on holdout test partition
    eval_res, preds = fl_core.evaluate(global_model, X_test, y_test)
    val_acc = float(accuracy_score(y_test, preds))
    val_f1 = float(f1_score(y_test, preds, average="macro", zero_division=0))
    r_dur = time.time() - r_start

    comm_bytes = NUM_CLIENTS * param_size_bytes * 2  # download + upload

    round_record = {
        "round": r,
        "n_clients": NUM_CLIENTS,
        "local_epochs": LOCAL_EPOCHS,
        "train_loss": round(float(np.average(client_losses, weights=client_counts)), 5),
        "train_acc": round(float(np.average(client_accs, weights=client_counts)), 5),
        "val_loss": round(float(eval_res["loss"]), 5),
        "val_acc": round(val_acc, 5),
        "val_macro_f1": round(val_f1, 5),
        "duration_sec": round(r_dur, 2),
        "aggregation_sec": round(agg_dur, 4),
        "communication_bytes": comm_bytes,
    }
    history.append(round_record)
    print(
        f"Round {r}/{ROUNDS} ({r_dur:.2f}s): "
        f"Train Loss={round_record['train_loss']:.4f}, "
        f"Train Acc={round_record['train_acc']*100:.2f}%, "
        f"Val Acc={val_acc*100:.2f}%, "
        f"Val F1={val_f1*100:.2f}% "
        f"(Comm: {comm_bytes/1024:.1f} KB)"
    )

out_dir = REPO_ROOT / "experiments" / "verified_fl_5clients_5rounds"
out_dir.mkdir(parents=True, exist_ok=True)
torch.save(global_weights, out_dir / "global_model_final.pt")

with open(out_dir / "history.json", "w") as f:
    json.dump(history, f, indent=2)

# Also save the scaler used for this FL model so it can be independently loaded and inferred
with open(out_dir / "fl_scaler.json", "w") as f:
    json.dump({"mean": mean.tolist(), "std": std.tolist()}, f, indent=2)

print("\n=== FEDERATED EXPERIMENT SUMMARY ===")
print(f"Clients: {NUM_CLIENTS}")
print(f"Rounds: {ROUNDS}")
print(f"Local Epochs: {LOCAL_EPOCHS}")
print(f"Initial (Round 0) Loss: {initial_eval['loss']:.4f}, Acc: {init_acc*100:.2f}%")
print(f"Final (Round 5) Loss: {history[-1]['val_loss']:.4f}, Acc: {history[-1]['val_acc']*100:.2f}%, Macro F1: {history[-1]['val_macro_f1']*100:.2f}%")
print(f"Checkpoint saved to: {out_dir / 'global_model_final.pt'}")
print(f"History saved to: {out_dir / 'history.json'}")


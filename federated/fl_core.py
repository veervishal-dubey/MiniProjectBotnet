"""fl_core.py — single source of truth shared by Flower clients, server,
centralized baseline, and later the API / Raspberry Pi client."""
import random
import numpy as np
import torch
import torch.nn as nn

FEATURES = ['psh_flag_number','IAT','ARP','cwr_flag_number','Min','syn_flag_number',
 'ece_flag_number','Max','Tot size','DNS','fin_flag_number','ack_flag_number','Std',
 'rst_flag_number','Telnet','Header_Length','rst_count','Variance','HTTP','ICMP',
 'Protocol Type','Tot sum','AVG','fin_count','IRC','IGMP','IPv','Number','TCP','SSH','UDP',
 'Time_To_Live','SMTP','LLC','Rate','DHCP','ack_count','syn_count','HTTPS']
CLASSES = ['Benign','DDoS-ACK','DDoS-SYN','DDoS-TCP',
           'Mirai-greeth_flood','Mirai-greip_flood','Mirai-udpplain']
HIDDEN, DROPOUT = (128, 64, 32), 0.2

# ---------------- Model (same for every client, server, and baseline) ----------------
class FLMLP(nn.Module):
    """39 -> 128 -> 64 -> 32 -> 7. No BatchNorm (FedAvg-safe). Layer indices
    0/3/6/8 match the original checkpoint so shapes are directly comparable."""
    def __init__(self, n_in=len(FEATURES), n_out=len(CLASSES), hidden=HIDDEN, p=DROPOUT):
        super().__init__()
        h1, h2, h3 = hidden
        self.network = nn.Sequential(
            nn.Linear(n_in, h1), nn.ReLU(), nn.Dropout(p),
            nn.Linear(h1, h2),  nn.ReLU(), nn.Dropout(p),
            nn.Linear(h2, h3),  nn.ReLU(),
            nn.Linear(h3, n_out))
    def forward(self, x):
        return self.network(x)

def set_seed(seed):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)

# ---------------- Preprocessing: log1p + federated standardization ----------------
def local_stats(X_raw):
    """Run ON THE CLIENT over its own training data. Returns only aggregates."""
    Z = np.log1p(np.asarray(X_raw, dtype=np.float64))
    return len(Z), Z.sum(axis=0), (Z ** 2).sum(axis=0)

def aggregate_stats(stats):
    """Run ON THE SERVER. Combines (n, sum, sumsq) from all clients."""
    N = sum(s[0] for s in stats)
    S = sum(s[1] for s in stats); SS = sum(s[2] for s in stats)
    mean = S / N
    std = np.sqrt(np.maximum(SS / N - mean ** 2, 0.0))
    std[std < 1e-8] = 1.0
    return mean.astype(np.float32), std.astype(np.float32), int(N)

def transform(X_raw, mean, std):
    return ((np.log1p(np.asarray(X_raw, dtype=np.float32)) - mean) / std).astype(np.float32)

# ---------------- Client-local storage ----------------
def load_client(store_dir, k):
    d = np.load(f'{store_dir}/client_{k}.npz')
    return {key: d[key] for key in d.files}

# ---------------- Local training / evaluation ----------------
def train_local(model, X, y, epochs=1, batch_size=512, lr=1e-3, seed=0,
                class_weights=None, threads=None):
    if threads: torch.set_num_threads(threads)
    torch.manual_seed(seed)                     # dropout RNG
    g = torch.Generator().manual_seed(seed)     # shuffling RNG
    Xt = torch.from_numpy(np.ascontiguousarray(X, dtype=np.float32))
    yt = torch.from_numpy(np.asarray(y, dtype=np.int64))
    w = None if class_weights is None else torch.as_tensor(class_weights, dtype=torch.float32)
    loss_fn = nn.CrossEntropyLoss(weight=w)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    model.train(); n = len(yt); tot, correct, seen = 0.0, 0, 0
    for _ in range(epochs):
        perm = torch.randperm(n, generator=g)
        for i in range(0, n, batch_size):
            idx = perm[i:i + batch_size]; xb, yb = Xt[idx], yt[idx]
            opt.zero_grad(set_to_none=True)
            out = model(xb); loss = loss_fn(out, yb); loss.backward(); opt.step()
            tot += loss.item() * len(idx); correct += (out.argmax(1) == yb).sum().item()
            seen += len(idx)
    return {'train_loss': tot / seen, 'train_acc': correct / seen, 'num-examples': n}

@torch.no_grad()
def predict_logits(model, X, batch_size=65536):
    model.eval()
    outs = [model(torch.from_numpy(np.ascontiguousarray(X[i:i + batch_size], dtype=np.float32)))
            for i in range(0, len(X), batch_size)]
    return torch.cat(outs)

def evaluate(model, X, y):
    logits = predict_logits(model, X)
    yt = torch.from_numpy(np.asarray(y, dtype=np.int64))
    loss = nn.functional.cross_entropy(logits, yt).item()
    pred = logits.argmax(1).numpy()
    return {'loss': loss, 'acc': float((pred == np.asarray(y)).mean())}, pred

# ---------------- Manual FedAvg (reference / verification)


def weighted_average(state_dicts, weights):
    keys = list(state_dicts[0].keys())
    for sd in state_dicts:
        assert list(sd.keys()) == keys, "parameter names differ between clients"
        assert all(sd[k].shape == state_dicts[0][k].shape for k in keys), "shape mismatch"
    W = float(sum(weights))
    return {k: (sum(sd[k].double() * float(w) for sd, w in zip(state_dicts, weights)) / W)
               .to(state_dicts[0][k].dtype) for k in keys}

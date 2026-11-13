import os
from pathlib import Path
import numpy as np
import pandas as pd

REPO_ROOT = Path("MiniProjectBotnet").resolve()
sample_dir = REPO_ROOT / "ml" / "data" / "samples"
sample_dir.mkdir(parents=True, exist_ok=True)

cache_dir = REPO_ROOT / "federated" / "cache"
if (cache_dir / "X_clean.npy").exists():
    import joblib
    features = joblib.load(REPO_ROOT / "ml" / "artifacts" / "feature_columns.joblib")
    encoder = joblib.load(REPO_ROOT / "ml" / "artifacts" / "label_encoder.joblib")
    X_clean = np.load(cache_dir / "X_clean.npy", mmap_mode="r")
    y_clean = np.load(cache_dir / "y_clean.npy", mmap_mode="r")

    sample_indices = []
    sample_labels = []
    for c_idx, c_name in enumerate(encoder.classes_):
        matches = np.where(y_clean == c_idx)[0][:3]  # 3 per class
        sample_indices.extend(matches)
        sample_labels.extend([c_name] * len(matches))

    sample_X = np.array(X_clean[sample_indices])
    df_cic = pd.DataFrame(sample_X, columns=features)
    df_cic["label"] = sample_labels
    cic_csv_path = sample_dir / "cic_iot_2023_sample.csv"
    df_cic.to_csv(cic_csv_path, index=False)
    print(f"Generated authentic CIC IoT 2023 sample ({len(df_cic)} rows) at: {cic_csv_path}")

# 2. Edge-IIoTset Sample
edge_cols = [
    "frame.time", "ip.src_host", "ip.dst_host", "arp.opcode", "arp.hw.size",
    "icmp.checksum", "icmp.seq_le", "http.response", "http.tls_version",
    "tcp.ack", "tcp.connection.fin", "tcp.flags", "tcp.len", "tcp.seq",
    "udp.port", "udp.stream", "mqtt.topic", "Attack_label", "Attack_type"
]
edge_data = [
    ["1648028000.100", "192.168.0.128", "192.168.0.1", 0, 0, 0, 0, 200, 0, 1024, 0, 0x18, 1460, 4820, 0, 0, "", 0, "Normal"],
    ["1648028001.200", "192.168.0.150", "192.168.0.1", 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0, 100, 0, 0, "", 1, "DDoS_TCP"],
    ["1648028002.300", "192.168.0.151", "192.168.0.1", 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 53, 12, "", 1, "DDoS_UDP"],
    ["1648028003.400", "192.168.0.160", "192.168.0.50", 0, 0, 0, 0, 0, 0, 2048, 1, 0x11, 256, 12000, 0, 0, "factory/sensor1", 1, "Ransomware"],
    ["1648028004.500", "192.168.0.165", "192.168.0.80", 0, 0, 0, 0, 404, 0, 4096, 0, 0x18, 1024, 8500, 0, 0, "", 1, "Vulnerability_scanner"],
]
df_edge = pd.DataFrame(edge_data, columns=edge_cols)
edge_csv_path = sample_dir / "edge_iiotset_sample.csv"
df_edge.to_csv(edge_csv_path, index=False)
print(f"Generated Edge-IIoTset sample ({len(df_edge)} rows) at: {edge_csv_path}")

# 3. N-BaIoT / N-IoT Sample
nbaiot_cols = [
    "MI_dir_L5_weight", "MI_dir_L5_mean", "MI_dir_L5_variance",
    "MI_dir_L3_weight", "MI_dir_L3_mean", "MI_dir_L3_variance",
    "MI_dir_L1_weight", "MI_dir_L1_mean", "MI_dir_L1_variance",
    "H_L5_weight", "H_L5_mean", "H_L5_variance",
    "HH_L5_weight", "HH_L5_mean", "HH_L5_std", "HH_L5_magnitude",
    "HH_jit_L5_weight", "HH_jit_L5_mean", "HH_jit_L5_variance",
    "HpHp_L5_weight", "HpHp_L5_mean", "HpHp_L5_std", "HpHp_L5_magnitude",
    "HpHp_L5_radius", "HpHp_L5_covariance", "HpHp_L5_pcorrelation",
    "attack_type"
]
np.random.seed(42)
nbaiot_rows = []
attacks = ["benign", "mirai_scan", "mirai_ack", "mirai_syn", "bashlite_combo"]
for att in attacks:
    row = np.random.uniform(0.1, 100.0, size=len(nbaiot_cols) - 1).tolist()
    row.append(att)
    nbaiot_rows.append(row)

df_nbaiot = pd.DataFrame(nbaiot_rows, columns=nbaiot_cols)
nbaiot_csv_path = sample_dir / "n_iot_sample.csv"
df_nbaiot.to_csv(nbaiot_csv_path, index=False)
print(f"Generated N-IoT sample ({len(df_nbaiot)} rows) at: {nbaiot_csv_path}")


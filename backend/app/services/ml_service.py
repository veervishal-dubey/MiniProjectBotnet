import io
import json
import time
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
import pandas as pd
import joblib
import torch
import torch.nn as nn

from app.core.config import settings
from app.schemas.ml import PredictionResult, BatchPredictionResponse, SingleFlowPredictRequest

logger = logging.getLogger(__name__)


# Feature alias dictionary mapping common IoT capture column variations to canonical 39 features
FEATURE_ALIASES: Dict[str, List[str]] = {
    "psh_flag_number": ["psh_flag_number", "psh flag number", "psh_flag_count", "psh_count", "psh_flags", "psh"],
    "IAT": ["iat", "flow_iat_mean", "flow iat mean", "flow iat", "inter_arrival_time", "flow_iat_min", "flow_iat_max"],
    "ARP": ["arp", "is_arp", "arp_protocol", "proto_arp"],
    "cwr_flag_number": ["cwr_flag_number", "cwr flag number", "cwr_flag_count", "cwr_flags", "cwr"],
    "Min": ["min", "min_packet_length", "min_pkt_len", "fwd_pkt_len_min", "pkt_len_min", "packet_length_min"],
    "syn_flag_number": ["syn_flag_number", "syn flag number", "syn_flag_count", "syn_count", "syn_flags", "syn"],
    "ece_flag_number": ["ece_flag_number", "ece flag number", "ece_flag_count", "ece_flags", "ece"],
    "Max": ["max", "max_packet_length", "max_pkt_len", "fwd_pkt_len_max", "pkt_len_max", "packet_length_max"],
    "Tot size": ["tot size", "total size", "tot_size", "total_size", "fwd_header_length", "tot_len", "total_length"],
    "DNS": ["dns", "is_dns", "proto_dns", "service_dns"],
    "fin_flag_number": ["fin_flag_number", "fin flag number", "fin_flag_count", "fin_count", "fin_flags", "fin"],
    "ack_flag_number": ["ack_flag_number", "ack flag number", "ack_flag_count", "ack_count", "ack_flags", "ack"],
    "Std": ["std", "std_dev", "pkt_len_std", "packet_length_std", "fwd_pkt_len_std"],
    "rst_flag_number": ["rst_flag_number", "rst flag number", "rst_flag_count", "rst_count", "rst_flags", "rst"],
    "Telnet": ["telnet", "is_telnet", "proto_telnet", "service_telnet"],
    "Header_Length": ["header_length", "fwd_header_length", "fwd_header_len", "hdr_len", "header_len"],
    "rst_count": ["rst_count", "rst count", "rst_flag_number", "rst_number"],
    "Variance": ["variance", "var", "pkt_len_var", "packet_length_var", "fwd_pkt_len_var"],
    "HTTP": ["http", "is_http", "proto_http", "service_http"],
    "ICMP": ["icmp", "is_icmp", "proto_icmp"],
    "Protocol Type": ["protocol type", "protocol_type", "protocol", "proto", "proto_type"],
    "Tot sum": ["tot sum", "total sum", "tot_sum", "total_sum", "flow_bytes_s", "tot_bytes"],
    "AVG": ["avg", "average", "mean", "pkt_len_mean", "fwd_pkt_len_mean", "packet_length_mean"],
    "fin_count": ["fin_count", "fin count", "fin_flag_number", "fin_number"],
    "IRC": ["irc", "is_irc", "proto_irc", "service_irc"],
    "IGMP": ["igmp", "is_igmp", "proto_igmp"],
    "IPv": ["ipv", "is_ipv4", "is_ipv6", "ipv4", "ipv6"],
    "Number": ["number", "tot_fwd_pkts", "total_packets", "packet_count", "tot_pkts", "total_fwd_packets"],
    "TCP": ["tcp", "is_tcp", "proto_tcp"],
    "SSH": ["ssh", "is_ssh", "proto_ssh", "service_ssh"],
    "UDP": ["udp", "is_udp", "proto_udp"],
    "Time_To_Live": ["time_to_live", "ttl", "ip_ttl"],
    "SMTP": ["smtp", "is_smtp", "proto_smtp", "service_smtp"],
    "LLC": ["llc", "is_llc", "proto_llc"],
    "Rate": ["rate", "flow rate", "flow_rate", "flow_byts_per_sec", "flow_packets_s", "packet_rate"],
    "DHCP": ["dhcp", "is_dhcp", "proto_dhcp", "service_dhcp"],
    "ack_count": ["ack_count", "ack count", "ack_flag_number", "ack_number"],
    "syn_count": ["syn_count", "syn count", "syn_flag_number", "syn_number"],
    "HTTPS": ["https", "is_https", "proto_https", "service_https", "ssl"],
}


class FLMLP(nn.Module):
    """
    39 -> 128 -> 64 -> 32 -> 7 Multilayer Perceptron.
    Exact match to mlp_model.pth checkpoint and fl_core.py architecture.
    """
    def __init__(self, n_in: int = 39, n_out: int = 7, hidden: Tuple[int, int, int] = (128, 64, 32), p: float = 0.2):
        super().__init__()
        h1, h2, h3 = hidden
        self.network = nn.Sequential(
            nn.Linear(n_in, h1),
            nn.ReLU(),
            nn.Dropout(p),
            nn.Linear(h1, h2),
            nn.ReLU(),
            nn.Dropout(p),
            nn.Linear(h2, h3),
            nn.ReLU(),
            nn.Linear(h3, n_out),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class MLService:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[FLMLP] = None
        self.scaler = None
        self.label_encoder = None
        self.feature_columns: List[str] = []
        self.classes: List[str] = []
        self.is_loaded: bool = False
        self.load_error: Optional[str] = None
        self.model_version: str = "v1.0.0-centralized-mlp"
        self.dataset_evaluations: Dict[str, Dict[str, Any]] = {}
        self.dataset_predictions: Dict[str, BatchPredictionResponse] = {}

        # Attempt to load model and artifacts on startup
        self.load_artifacts()


    def load_artifacts(self) -> None:
        """Loads mlp_model.pth, scaler.joblib, label_encoder.joblib, and feature_columns.joblib."""
        try:
            artifacts_dir = settings.ML_ARTIFACTS_DIR
            if not artifacts_dir.exists():
                raise FileNotFoundError(f"ML artifacts directory not found at: {artifacts_dir}")

            model_path = artifacts_dir / "mlp_model.pth"
            scaler_path = artifacts_dir / "scaler.joblib"
            encoder_path = artifacts_dir / "label_encoder.joblib"
            features_path = artifacts_dir / "feature_columns.joblib"

            for p in [model_path, scaler_path, encoder_path, features_path]:
                if not p.exists():
                    raise FileNotFoundError(f"Required ML artifact missing: {p.name} at {p}")

            # 1. Load feature columns
            self.feature_columns = joblib.load(features_path)
            if not isinstance(self.feature_columns, (list, np.ndarray)) or len(self.feature_columns) != 39:
                raise ValueError(f"Expected 39 feature columns, got {len(self.feature_columns)}")
            self.feature_columns = list(self.feature_columns)

            # 2. Load label encoder
            self.label_encoder = joblib.load(encoder_path)
            self.classes = list(self.label_encoder.classes_)

            # 3. Load scaler
            self.scaler = joblib.load(scaler_path)

            # 4. Load PyTorch checkpoint
            checkpoint = torch.load(model_path, map_location=self.device, weights_only=False)
            state_dict = checkpoint["model_state_dict"] if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint else checkpoint

            self.model = FLMLP(n_in=len(self.feature_columns), n_out=len(self.classes))
            self.model.load_state_dict(state_dict)
            self.model.to(self.device)
            self.model.eval()

            self.is_loaded = True
            self.load_error = None
            logger.info(
                f"Successfully loaded centralized MLP model on {self.device}. "
                f"Inputs: {len(self.feature_columns)}, Classes: {len(self.classes)}"
            )
        except Exception as exc:
            self.is_loaded = False
            self.load_error = str(exc)
            logger.error(f"Failed to load ML artifacts: {exc}", exc_info=True)

    def get_health(self) -> Dict[str, Any]:
        """Returns model health, architecture details, and loading status."""
        return {
            "status": "healthy" if self.is_loaded else "degraded",
            "model_name": "SentinelFL Centralized MLP",
            "model_version": self.model_version,
            "architecture": "FLMLP (39 -> 128 -> 64 -> 32 -> 7, ReLU, Dropout 0.2)",
            "device": str(self.device),
            "input_features_count": len(self.feature_columns),
            "num_classes": len(self.classes),
            "classes": self.classes,
            "feature_columns": self.feature_columns,
            "scaler_type": type(self.scaler).__name__ if self.scaler else "None",
            "checkpoint_loaded": self.is_loaded,
            "error": self.load_error,
        }

    def map_simulated_flow_to_features(self, req: SingleFlowPredictRequest) -> Dict[str, float]:
        """
        Maps high-level network flow simulation parameters to the 39 expected feature columns.
        If custom features dict is provided, merges them with priority.
        """
        features: Dict[str, float] = {col: 0.0 for col in self.feature_columns}

        # Protocol mapping
        proto = (req.protocol or "").upper()
        if "TCP" in proto:
            features["TCP"] = 1.0
            features["Protocol Type"] = 6.0
        elif "UDP" in proto:
            features["UDP"] = 1.0
            features["Protocol Type"] = 17.0
        elif "ICMP" in proto:
            features["ICMP"] = 1.0
            features["Protocol Type"] = 1.0

        # Port-based service mapping
        dst_p = req.dst_port or 0
        src_p = req.src_port or 0
        ports = {dst_p, src_p}
        if 80 in ports:
            features["HTTP"] = 1.0
        if 443 in ports:
            features["HTTPS"] = 1.0
        if 23 in ports:
            features["Telnet"] = 1.0
        if 22 in ports:
            features["SSH"] = 1.0
        if 53 in ports:
            features["DNS"] = 1.0
        if 25 in ports or 587 in ports:
            features["SMTP"] = 1.0
        if 67 in ports or 68 in ports:
            features["DHCP"] = 1.0
        if 6667 in ports:
            features["IRC"] = 1.0

        # TCP Flags
        flags = (req.flags or "").upper()
        if "SYN" in flags:
            features["syn_flag_number"] = 1.0
            features["syn_count"] = 1.0
        if "ACK" in flags:
            features["ack_flag_number"] = 1.0
            features["ack_count"] = 1.0
        if "PSH" in flags:
            features["psh_flag_number"] = 1.0
        if "FIN" in flags:
            features["fin_flag_number"] = 1.0
            features["fin_count"] = 1.0
        if "RST" in flags:
            features["rst_flag_number"] = 1.0
            features["rst_count"] = 1.0
        if "ECE" in flags:
            features["ece_flag_number"] = 1.0
        if "CWR" in flags:
            features["cwr_flag_number"] = 1.0

        # Duration and packet flow metrics
        dur = max(0.001, float(req.flow_duration_ms or 1.0))
        pkts = max(1.0, float(req.tot_fwd_pkts or 1.0))
        features["Tot sum"] = pkts * 64.0
        features["Tot size"] = pkts * 64.0
        features["AVG"] = 64.0
        features["Min"] = 64.0
        features["Max"] = 64.0
        features["Rate"] = pkts / (dur / 1000.0)
        features["IAT"] = (dur / 1000.0) / pkts
        features["Header_Length"] = pkts * 20.0
        features["Time_To_Live"] = 64.0
        features["IPv"] = 1.0
        features["Number"] = pkts

        # Merge any user-provided explicit feature overrides
        if req.features:
            for k, v in req.features.items():
                if k in features:
                    features[k] = float(v)

        return features

    def canonicalize_class_name(self, raw_label: Any) -> Optional[str]:
        """Normalizes raw dataset label values to standard 7 classes if matching."""
        if raw_label is None or pd.isna(raw_label):
            return None
        s = str(raw_label).strip()
        for cls_name in self.classes:
            if s.lower() == cls_name.lower() or s.lower().replace("-", "_") == cls_name.lower().replace("-", "_"):
                return cls_name
        low = s.lower()
        if "benign" in low or low in ["0", "normal"]:
            return "Benign"
        if "ack" in low:
            return "DDoS-ACK"
        if "syn" in low:
            return "DDoS-SYN"
        if "tcp" in low:
            return "DDoS-TCP"
        if "greeth" in low:
            return "Mirai-greeth_flood"
        if "greip" in low:
            return "Mirai-greip_flood"
        if "udpplain" in low or ("mirai" in low and "udp" in low):
            return "Mirai-udpplain"
        return s

    def predict_dataframe(
        self,
        df: pd.DataFrame,
        actual_labels: Optional[List[Optional[str]]] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Validates schema, aligns features, sanitizes infinities and extreme values,
        and generates genuine predictions for a batch DataFrame in memory-safe chunks.
        Never leaks target label into feature matrix.
        Returns: (results_list, rejected_count)
        """
        if not self.is_loaded or self.model is None or self.scaler is None:
            raise RuntimeError(f"ML model is not loaded: {self.load_error or 'Unknown failure'}")

        # 1. Align features using exact match, clean lowercase match, and FEATURE_ALIASES
        clean_col_map = {col.strip().lower(): col for col in df.columns}
        df_aligned = pd.DataFrame(index=df.index)
        missing_critical_cols = []

        # Categorize features: continuous traffic features vs. binary protocol/flag indicators
        flag_or_indicator_cols = {
            "ARP", "DNS", "Telnet", "HTTP", "HTTPS", "ICMP", "IGMP", "IRC", "IPv", "LLC",
            "SSH", "TCP", "UDP", "DHCP", "SMTP", "psh_flag_number", "cwr_flag_number",
            "syn_flag_number", "ece_flag_number", "fin_flag_number", "ack_flag_number",
            "rst_flag_number",
        }

        for expected_col in self.feature_columns:
            found_col = None
            if expected_col in df.columns:
                found_col = expected_col
            elif expected_col.strip().lower() in clean_col_map:
                found_col = clean_col_map[expected_col.strip().lower()]
            else:
                # Check aliases
                aliases = FEATURE_ALIASES.get(expected_col, [])
                for alias in aliases:
                    if alias in clean_col_map:
                        found_col = clean_col_map[alias]
                        break

            if found_col is not None:
                df_aligned[expected_col] = df[found_col]
            else:
                if expected_col in flag_or_indicator_cols:
                    # Missing indicator or protocol flag safely defaults to 0.0
                    df_aligned[expected_col] = 0.0
                else:
                    missing_critical_cols.append(expected_col)

        if len(missing_critical_cols) > 5:
            raise ValueError(
                f"Missing {len(missing_critical_cols)} critical network feature columns for model inference. "
                f"Example missing: {missing_critical_cols[:5]}"
            )
        elif missing_critical_cols:
            # For a minor missing column in unaligned capture, impute with 0.0
            for col in missing_critical_cols:
                df_aligned[col] = 0.0

        # 2. Reorder columns strictly as expected by scaler and model
        df_aligned = df_aligned[self.feature_columns]

        # 3. Numeric conversion and robust infinity/overflow detection
        raw_num = df_aligned.apply(pd.to_numeric, errors="coerce")
        raw_vals = raw_num.to_numpy(dtype=np.float64, na_value=np.nan)

        # Detect rows with unrecoverable corruption (e.g. all-NaN rows or corrupt non-numeric data)
        all_nan_rows = np.all(np.isnan(raw_vals), axis=1)

        # Sanitize positive and negative infinity and extreme overflow numbers (|x| > 1e300)
        # to prevent: ValueError: Input X contains infinity or a value too large for dtype('float64')
        clean_vals = np.where(np.isinf(raw_vals) | (np.abs(raw_vals) > 1e300), np.nan, raw_vals)
        # Impute residual NaNs with column medians or 0.0
        col_medians = np.nanmedian(clean_vals, axis=0)
        col_medians = np.nan_to_num(col_medians, nan=0.0)

        nan_mask = np.isnan(clean_vals)
        clean_vals[nan_mask] = np.take(col_medians, np.where(nan_mask)[1])

        clean_df = pd.DataFrame(clean_vals, columns=self.feature_columns, index=df.index)

        # 4. Standardize using pre-fitted StandardScaler
        X_scaled = self.scaler.transform(clean_df)

        # 5. Model forward pass in memory-safe chunks (1024 samples) in eval mode
        start_time = time.perf_counter()
        probabilities_list = []
        chunk_size = 1024
        total_samples = len(df_aligned)

        with torch.no_grad():
            for offset in range(0, total_samples, chunk_size):
                chunk = X_scaled[offset : offset + chunk_size]
                tensor_chunk = torch.from_numpy(np.ascontiguousarray(chunk, dtype=np.float32)).to(self.device)
                logits = self.model(tensor_chunk)
                probs = torch.softmax(logits, dim=1).cpu().numpy()
                probabilities_list.append(probs)

        probabilities = np.vstack(probabilities_list) if probabilities_list else np.empty((0, len(self.classes)))

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        avg_latency_per_sample = round(latency_ms / max(1, total_samples), 4)

        results = []
        rejected_count = 0

        for i, probs in enumerate(probabilities):
            is_rejected_row = bool(all_nan_rows[i])
            if is_rejected_row:
                rejected_count += 1
                pred_idx = 0
                predicted_class = "Rejected"
                confidence = 0.0
                is_malicious = False
                risk_level = "low"
                status_str = "rejected"
            else:
                pred_idx = int(np.argmax(probs))
                predicted_class = self.classes[pred_idx]
                confidence = float(probs[pred_idx])
                is_malicious = (predicted_class.lower() != "benign")
                status_str = "classified"

                if not is_malicious:
                    risk_level = "low"
                elif confidence >= 0.85:
                    risk_level = "critical"
                elif confidence >= 0.50:
                    risk_level = "high"
                else:
                    risk_level = "medium"

            prob_dict = {cls_name: round(float(p), 5) for cls_name, p in zip(self.classes, probs)}
            act_lbl = actual_labels[i] if (actual_labels and i < len(actual_labels)) else None

            results.append({
                "class_index": pred_idx,
                "predicted_class": predicted_class,
                "actual_label": act_lbl,
                "confidence": round(confidence, 4),
                "is_malicious": is_malicious,
                "risk_level": risk_level,
                "probabilities": prob_dict,
                "status": status_str,
                "inference_latency_ms": avg_latency_per_sample,
            })

        return results, rejected_count

    def predict_single_flow(self, req: SingleFlowPredictRequest) -> PredictionResult:
        """
        Executes prediction for a single flow simulation request.
        Validates feature types and names if custom vector is provided.
        """
        flow_features = self.map_simulated_flow_to_features(req)
        df = pd.DataFrame([flow_features])
        results, _ = self.predict_dataframe(df)
        res = results[0]

        flow_id = req.flow_id or f"flow-{int(time.time() * 1000)}"
        return PredictionResult(
            id=flow_id,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            src_ip=req.src_ip,
            src_port=req.src_port,
            dst_ip=req.dst_ip,
            dst_port=req.dst_port,
            protocol=req.protocol,
            flow_duration_ms=req.flow_duration_ms,
            tot_fwd_pkts=req.tot_fwd_pkts,
            flags=req.flags,
            predicted_class=res["predicted_class"],
            class_index=res["class_index"],
            actual_label=None,
            status=res["status"],
            is_malicious=res["is_malicious"],
            confidence=res["confidence"],
            risk_level=res["risk_level"],
            probabilities=res["probabilities"],
            model_version=self.model_version,
            inference_latency_ms=res["inference_latency_ms"],
        )

    def predict_csv_bytes(
        self,
        csv_bytes: bytes,
        filename: str = "upload.csv",
        dataset_id: Optional[str] = None,
        dataset_name: Optional[str] = None,
    ) -> BatchPredictionResponse:
        """
        Parses uploaded CSV bytes, isolates ground-truth target label if present,
        runs batch prediction across all valid records, computes confusion matrix
        and honest per-class distributions, and returns structured summary.
        """
        try:
            df = pd.read_csv(io.BytesIO(csv_bytes))
        except Exception as exc:
            raise ValueError(f"Could not parse uploaded file as CSV: {exc}")

        if df.empty:
            raise ValueError("Uploaded CSV file contains no data rows.")

        total_rows = len(df)

        # 1. Check for ground truth target label column
        label_col = next(
            (c for c in df.columns if c.strip().lower() in ["label", "target", "class", "attack_cat", "threat_class", "category"]),
            None,
        )

        actual_labels: Optional[List[Optional[str]]] = None
        df_for_model = df.copy()

        if label_col:
            raw_labels = df[label_col].tolist()
            actual_labels = [self.canonicalize_class_name(l) for l in raw_labels]
            # STRICT NO-DATA-LEAKAGE: remove target column from input feature matrix
            df_for_model = df_for_model.drop(columns=[label_col])

        # 2. Execute inference across all records
        predictions, rejected_count = self.predict_dataframe(df_for_model, actual_labels=actual_labels)

        flows: List[PredictionResult] = []
        malicious_count = 0
        benign_count = 0

        # Class counts initialized for all 7 classes (strictly 0 for unpredicted classes)
        per_class_counts: Dict[str, int] = {c: 0 for c in self.classes}

        # Try to pull standard flow identifier columns if present in CSV
        src_ip_col = next((c for c in df.columns if c.lower() in ["src_ip", "srcip", "source_ip"]), None)
        dst_ip_col = next((c for c in df.columns if c.lower() in ["dst_ip", "dstip", "destination_ip"]), None)
        src_port_col = next((c for c in df.columns if c.lower() in ["src_port", "srcport", "source_port", "sport"]), None)
        dst_port_col = next((c for c in df.columns if c.lower() in ["dst_port", "dstport", "destination_port", "dport"]), None)
        proto_col = next((c for c in df.columns if c.lower() in ["protocol", "proto"]), None)

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        for idx, res in enumerate(predictions):
            pred_cls = res["predicted_class"]
            if pred_cls in per_class_counts:
                per_class_counts[pred_cls] += 1
            elif pred_cls != "Rejected":
                per_class_counts[pred_cls] = 1

            if res["is_malicious"]:
                malicious_count += 1
            elif pred_cls.lower() == "benign":
                benign_count += 1

            row_src_ip = str(df.iloc[idx][src_ip_col]) if src_ip_col and pd.notna(df.iloc[idx][src_ip_col]) else "192.168.1.100"
            row_dst_ip = str(df.iloc[idx][dst_ip_col]) if dst_ip_col and pd.notna(df.iloc[idx][dst_ip_col]) else "198.51.100.1"

            def _to_port(v, default):
                try:
                    f = float(v)
                    return int(f) if np.isfinite(f) and 0 <= f <= 65535 else default
                except (ValueError, TypeError, OverflowError):
                    return default

            def _to_float(v, default):
                try:
                    f = float(v)
                    return f if np.isfinite(f) else default
                except (ValueError, TypeError, OverflowError):
                    return default

            def _to_int(v, default, min_val=0, max_val=1000000):
                try:
                    f = float(v)
                    return max(min_val, min(max_val, int(f))) if np.isfinite(f) else default
                except (ValueError, TypeError, OverflowError):
                    return default

            row_src_port = _to_port(df.iloc[idx][src_port_col], 49152 + (idx % 1000)) if src_port_col and pd.notna(df.iloc[idx][src_port_col]) else 49152 + (idx % 1000)
            row_dst_port = _to_port(df.iloc[idx][dst_port_col], 80) if dst_port_col and pd.notna(df.iloc[idx][dst_port_col]) else 80
            row_proto = str(df.iloc[idx][proto_col]) if proto_col and pd.notna(df.iloc[idx][proto_col]) else ("TCP" if df.iloc[idx].get("TCP", 0) == 1 else "UDP")

            flow_duration = _to_float(df.iloc[idx].get("IAT", 0.0), 0.1) * 1000.0 if "IAT" in df.columns else 100.0
            tot_pkts = _to_int(df.iloc[idx].get("Tot sum", 64.0) / 64.0, 10) if "Tot sum" in df.columns else 10

            flows.append(PredictionResult(
                id=f"flow-{idx+1}",
                timestamp=now_iso,
                src_ip=row_src_ip,
                src_port=row_src_port,
                dst_ip=row_dst_ip,
                dst_port=row_dst_port,
                protocol=row_proto,
                flow_duration_ms=flow_duration,
                tot_fwd_pkts=tot_pkts,
                flags="SYN" if df.iloc[idx].get("syn_flag_number", 0) == 1 else "ACK",
                predicted_class=pred_cls,
                class_index=res["class_index"],
                actual_label=res.get("actual_label"),
                status=res["status"],
                is_malicious=res["is_malicious"],
                confidence=res["confidence"],
                risk_level=res["risk_level"],
                probabilities=res["probabilities"],
                model_version=self.model_version,
                inference_latency_ms=res["inference_latency_ms"],
            ))

        total_classified = len(flows)
        per_class_percentages: Dict[str, float] = {
            c: round((count / max(1, total_classified)) * 100, 2)
            for c, count in per_class_counts.items()
        }

        # 3. Compute Genuine Evaluation Metrics if Ground-Truth Labels Exist
        evaluation_result: Optional[Dict[str, Any]] = None
        if actual_labels and any(l is not None for l in actual_labels):
            evaluation_result = self.compute_evaluation_metrics(
                actual_labels=actual_labels,
                predictions=[f.predicted_class for f in flows],
                dataset_name=dataset_name or filename,
            )
            if dataset_id:
                self.dataset_evaluations[dataset_id] = evaluation_result
                try:
                    cache_dir = settings.PROCESSED_CACHE_DIR / dataset_id
                    cache_dir.mkdir(parents=True, exist_ok=True)
                    (cache_dir / "evaluation.json").write_text(json.dumps(evaluation_result, indent=2))
                except Exception as exc:
                    logger.debug(f"Could not write evaluation.json cache: {exc}")

        response = BatchPredictionResponse(
            total_flows=total_classified,
            malicious_count=malicious_count,
            benign_count=benign_count,
            failed_count=rejected_count,
            flows=flows,
            model_version=self.model_version,
            dataset_id=dataset_id,
            dataset_name=dataset_name or filename,
            per_class_counts=per_class_counts,
            per_class_percentages=per_class_percentages,
            evaluation=evaluation_result,
        )

        # 4. Cache prediction results for immediate state restoration
        if dataset_id:
            self.dataset_predictions[dataset_id] = response
            try:
                cache_dir = settings.PROCESSED_CACHE_DIR / dataset_id
                cache_dir.mkdir(parents=True, exist_ok=True)
                (cache_dir / "predictions.json").write_text(response.model_dump_json(indent=2))
            except Exception as exc:
                logger.debug(f"Could not write predictions.json cache: {exc}")

        return response

    def compute_evaluation_metrics(
        self,
        actual_labels: List[Optional[str]],
        predictions: List[str],
        dataset_name: str,
    ) -> Dict[str, Any]:
        """
        Computes empirical classification metrics, 7x7 confusion matrix, and per-class metrics
        strictly from genuine actual vs. predicted labels.
        """
        n_classes = len(self.classes)
        cls_to_idx = {c: i for i, c in enumerate(self.classes)}

        matrix = [[0] * n_classes for _ in range(n_classes)]
        valid_count = 0
        correct_count = 0
        benign_total = 0
        benign_false_positives = 0
        malicious_total = 0
        malicious_false_negatives = 0

        for act, pred in zip(actual_labels, predictions):
            if act is None:
                continue
            act_idx = cls_to_idx.get(act)
            pred_idx = cls_to_idx.get(pred)

            if act_idx is not None and pred_idx is not None:
                matrix[act_idx][pred_idx] += 1
                valid_count += 1
                if act_idx == pred_idx:
                    correct_count += 1

                # Benign FPR tracking
                if act.lower() == "benign":
                    benign_total += 1
                    if pred.lower() != "benign":
                        benign_false_positives += 1
                else:
                    malicious_total += 1
                    if pred.lower() == "benign":
                        malicious_false_negatives += 1

        if valid_count == 0:
            return {"totalSamples": 0, "hasGroundTruth": False}

        # Calculate per-class metrics
        per_class_performance = []
        precisions = []
        recalls = []
        f1_scores = []

        total_matrix_sum = valid_count

        for i, cls_name in enumerate(self.classes):
            tp = matrix[i][i]
            fp = sum(matrix[r][i] for r in range(n_classes) if r != i)
            fn = sum(matrix[i][c] for c in range(n_classes) if c != i)
            tn = total_matrix_sum - (tp + fp + fn)

            support = sum(matrix[i])
            prec = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
            rec = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
            f1 = round(2 * prec * rec / (prec + rec), 4) if (prec + rec) > 0 else 0.0
            fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0

            per_class_performance.append({
                "className": cls_name,
                "precision": prec,
                "recall": rec,
                "f1Score": f1,
                "support": support,
                "falsePositiveRate": fpr,
            })

            if support > 0:
                precisions.append(prec)
                recalls.append(rec)
                f1_scores.append(f1)

        accuracy = round(correct_count / valid_count, 4) if valid_count > 0 else 0.0
        macro_prec = round(float(np.mean(precisions)), 4) if precisions else 0.0
        macro_rec = round(float(np.mean(recalls)), 4) if recalls else 0.0
        macro_f1 = round(float(np.mean(f1_scores)), 4) if f1_scores else 0.0
        overall_fpr = round(benign_false_positives / max(1, benign_total), 4) if benign_total > 0 else 0.0
        overall_fnr = round(malicious_false_negatives / max(1, malicious_total), 4) if malicious_total > 0 else 0.0

        return {
            "datasetName": dataset_name,
            "totalSamples": valid_count,
            "hasGroundTruth": True,
            "accuracy": accuracy,
            "precision": macro_prec,
            "recall": macro_rec,
            "f1Score": macro_f1,
            "falsePositiveRate": overall_fpr,
            "falseNegativeRate": overall_fnr,
            "confusionMatrix": {
                "classes": self.classes,
                "matrix": matrix,
                "totalSamples": valid_count,
            },
            "perClassPerformance": per_class_performance,
            "evaluatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    def get_dataset_evaluation(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves stored evaluation for a dataset from memory or local cache."""
        if dataset_id in self.dataset_evaluations:
            return self.dataset_evaluations[dataset_id]

        cache_file = settings.PROCESSED_CACHE_DIR / dataset_id / "evaluation.json"
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                self.dataset_evaluations[dataset_id] = data
                return data
            except Exception:
                pass
        return None

    def get_dataset_predictions(self, dataset_id: str) -> Optional[BatchPredictionResponse]:
        """Retrieves cached batch predictions for a dataset from memory or local cache."""
        if dataset_id in self.dataset_predictions:
            return self.dataset_predictions[dataset_id]

        cache_file = settings.PROCESSED_CACHE_DIR / dataset_id / "predictions.json"
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                resp = BatchPredictionResponse.model_validate(data)
                self.dataset_predictions[dataset_id] = resp
                return resp
            except Exception as exc:
                logger.debug(f"Could not load cached predictions.json: {exc}")
        return None


# Global singleton instance
ml_service = MLService()


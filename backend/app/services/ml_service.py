import io
import json
import time
import uuid
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

    def detect_label_column(self, df: pd.DataFrame) -> Optional[str]:
        """
        Robust detection of ground-truth label column in uploaded dataset.
        Checks explicit names, stripped variants, and common suffix patterns.
        """
        known_exact = [
            "label", "labels", "target", "class", "classes",
            "attack", "attacks", "attack_type", "attack_cat", "threat",
            "threat_type", "threat_class", "category", "traffic_type",
            "ground_truth", "actual_label", "actual"
        ]
        # 1. Exact case-insensitive match
        for col in df.columns:
            clean_col = str(col).strip().lower()
            if clean_col in known_exact:
                return col
        # 2. Suffix match (e.g. 'threat_label', 'traffic_class') excluding protocol columns
        for col in df.columns:
            clean_col = str(col).strip().lower()
            if any(clean_col.endswith(sfx) for sfx in ["_label", "_target", "_class", "_attack", "_cat"]):
                if "protocol" not in clean_col and "proto" not in clean_col:
                    return col
        return None

    def canonicalize_class_name(self, raw_label: Any) -> Optional[str]:
        """Normalizes raw dataset label values to standard 7 classes if matching."""
        if raw_label is None or pd.isna(raw_label):
            return None
        s = str(raw_label).strip()

        # Handle numeric indices (0..6)
        try:
            num = float(s)
            if np.isfinite(num):
                idx = int(num)
                if 0 <= idx < len(self.classes):
                    return self.classes[idx]
        except (ValueError, TypeError, OverflowError):
            pass

        # Exact or case-insensitive match
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
        Validates schema using dataset adapters, aligns features without data leakage,
        safely sanitizes infinities and extreme values, and generates genuine predictions
        for a batch DataFrame in memory-safe chunks using the loaded PyTorch MLP.
        Returns: (results_list, rejected_count)
        """
        if not self.is_loaded or self.model is None or self.scaler is None:
            raise RuntimeError(f"ML model is not loaded: {self.load_error or 'Unknown failure'}")

        # 1. Detect dataset type and validate compatibility through the Adapter Architecture
        from app.adapters.registry import adapter_registry
        adapter, report = adapter_registry.detect_adapter(df)
        if not report.is_compatible_with_flmlp:
            try:
                from app.services.audit_service import audit_service
                audit_service.record_event(
                    severity="WARN",
                    category="DATASET",
                    message=f"Dataset schema '{report.dataset_name}' rejected for FLMLP inference: {report.rejection_reason}",
                    component="DatasetAdapterRegistry",
                    details={"dataset_name": report.dataset_name, "rejection_reason": report.rejection_reason},
                )
            except Exception:
                pass
            raise ValueError(
                f"Dataset '{report.dataset_name}' is incompatible with the FLMLP model. "
                f"{report.rejection_reason}"
            )

        # 2. Align and scale features through the verified adapter
        X_scaled, adapter_labels, _ = adapter.align_and_preprocess(df, scaler=self.scaler)
        if actual_labels is None and adapter_labels is not None:
            actual_labels = adapter_labels

        total_samples = len(df)
        all_nan_rows = np.all(np.isnan(X_scaled), axis=1)

        # 3. Model forward pass in memory-safe chunks (1024 samples) in eval mode
        start_time = time.perf_counter()
        probabilities_list = []
        chunk_size = 1024
        total_samples = len(df)

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

        try:
            from app.services.audit_service import audit_service
            audit_service.record_event(
                severity="WARN" if res.get("is_malicious") else "INFO",
                category="DETECTION",
                message=f"Single flow classified as '{res['predicted_class']}' ({res['confidence'] * 100:.1f}% confidence) - Risk: {res['risk_level'].upper()}",
                component="MLService",
                details={
                    "flow_id": flow_id,
                    "predicted_class": res["predicted_class"],
                    "confidence": res["confidence"],
                    "is_malicious": res.get("is_malicious", False),
                    "risk_level": res["risk_level"],
                    "src_ip": req.src_ip,
                    "dst_ip": req.dst_ip,
                    "protocol": req.protocol,
                },
            )
        except Exception:
            pass

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
        label_col = self.detect_label_column(df)

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

        try:
            from app.services.audit_service import audit_service
            audit_service.record_event(
                severity="WARN" if malicious_count > 0 else "INFO",
                category="DETECTION",
                message=f"Batch CSV classification completed for '{filename}': {malicious_count} malicious attacks, {benign_count} benign flows ({total_classified} total).",
                component="MLService",
                details={
                    "filename": filename,
                    "total_flows": total_classified,
                    "malicious_count": malicious_count,
                    "benign_count": benign_count,
                    "model": self.model_version,
                    "has_ground_truth": bool(evaluation_result is not None),
                },
            )
            if evaluation_result:
                audit_service.record_event(
                    severity="INFO",
                    category="TRAINING",
                    message=f"Ground-truth evaluation calculated for '{dataset_name or filename}': Accuracy {evaluation_result.get('accuracy', 0)*100:.2f}%, Macro F1 {evaluation_result.get('macro_f1', 0)*100:.2f}%.",
                    component="MLService",
                    details={
                        "dataset_name": dataset_name or filename,
                        "accuracy": evaluation_result.get("accuracy"),
                        "macro_precision": evaluation_result.get("macro_precision"),
                        "macro_recall": evaluation_result.get("macro_recall"),
                        "macro_f1": evaluation_result.get("macro_f1"),
                        "evaluated_samples": evaluation_result.get("evaluated_samples"),
                    },
                )
        except Exception:
            pass

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
            return {
                "total_samples": 0,
                "totalSamples": 0,
                "evaluated_samples": 0,
                "evaluatedSamples": 0,
                "has_ground_truth": False,
                "hasGroundTruth": False,
            }

        # Calculate per-class metrics
        per_class_performance = []
        precisions = []
        recalls = []
        f1_scores = []
        supports = []

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
                "class_name": cls_name,
                "precision": prec,
                "recall": rec,
                "f1Score": f1,
                "f1_score": f1,
                "support": support,
                "falsePositiveRate": fpr,
                "false_positive_rate": fpr,
                "fpr": fpr,
            })

            if support > 0:
                precisions.append(prec)
                recalls.append(rec)
                f1_scores.append(f1)
                supports.append(support)

        accuracy = round(correct_count / valid_count, 4) if valid_count > 0 else 0.0
        macro_prec = round(float(np.mean(precisions)), 4) if precisions else 0.0
        macro_rec = round(float(np.mean(recalls)), 4) if recalls else 0.0
        macro_f1 = round(float(np.mean(f1_scores)), 4) if f1_scores else 0.0

        # Weighted metrics
        sum_support = sum(supports)
        weighted_prec = round(float(sum(p * s for p, s in zip(precisions, supports)) / sum_support), 4) if sum_support > 0 else 0.0
        weighted_rec = round(float(sum(r * s for r, s in zip(recalls, supports)) / sum_support), 4) if sum_support > 0 else 0.0
        weighted_f1 = round(float(sum(f * s for f, s in zip(f1_scores, supports)) / sum_support), 4) if sum_support > 0 else 0.0

        overall_fpr = round(benign_false_positives / max(1, benign_total), 4) if benign_total > 0 else 0.0
        overall_fnr = round(malicious_false_negatives / max(1, malicious_total), 4) if malicious_total > 0 else 0.0
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        return {
            # Standard snake_case
            "dataset_name": dataset_name,
            "total_samples": valid_count,
            "evaluated_samples": valid_count,
            "has_ground_truth": True,
            "accuracy": accuracy,
            "precision": macro_prec,
            "recall": macro_rec,
            "f1_score": macro_f1,
            "macro_precision": macro_prec,
            "macro_recall": macro_rec,
            "macro_f1": macro_f1,
            "weighted_precision": weighted_prec,
            "weighted_recall": weighted_rec,
            "weighted_f1": weighted_f1,
            "false_positive_rate": overall_fpr,
            "false_negative_rate": overall_fnr,
            "confusion_matrix": {
                "classes": self.classes,
                "matrix": matrix,
                "total_samples": valid_count,
                "totalSamples": valid_count,
            },
            "per_class_performance": per_class_performance,
            "evaluated_at": now_iso,
            "model_version": self.model_version,

            # camelCase aliases for seamless frontend compatibility
            "datasetName": dataset_name,
            "totalSamples": valid_count,
            "evaluatedSamples": valid_count,
            "hasGroundTruth": True,
            "macroPrecision": macro_prec,
            "macroRecall": macro_rec,
            "f1Score": macro_f1,
            "macroF1": macro_f1,
            "weightedPrecision": weighted_prec,
            "weightedRecall": weighted_rec,
            "weightedF1": weighted_f1,
            "falsePositiveRate": overall_fpr,
            "falseNegativeRate": overall_fnr,
            "confusionMatrix": {
                "classes": self.classes,
                "matrix": matrix,
                "totalSamples": valid_count,
                "total_samples": valid_count,
            },
            "perClassPerformance": per_class_performance,
            "evaluatedAt": now_iso,
            "modelVersion": self.model_version,
        }

    def evaluate_csv_bytes(
        self,
        csv_bytes: bytes,
        filename: str = "evaluation_dataset.csv",
        model_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Parses uploaded CSV bytes, rigorously checks for ground-truth label column,
        isolates the labels to prevent data leakage, aligns features using the adapter,
        runs batch inference through the PyTorch FLMLP model, computes genuine empirical metrics
        (Accuracy, Macro/Weighted F1, FPR, FNR, 7x7 confusion matrix, per-class metrics),
        persists the evaluation to storage/evaluations/{eval_id}.json, and records an audit log.
        """
        if not self.is_loaded or self.model is None or self.scaler is None:
            raise RuntimeError(f"ML model is not loaded: {self.load_error or 'Unknown failure'}")

        try:
            df = pd.read_csv(io.BytesIO(csv_bytes))
        except Exception as exc:
            raise ValueError(f"Could not parse uploaded file as CSV: {exc}")

        if df.empty:
            raise ValueError("Uploaded CSV file contains no data rows.")

        # 1. Identify ground-truth label column
        label_col = self.detect_label_column(df)
        if not label_col:
            raise ValueError(
                f"Uploaded dataset '{filename}' does not contain recognized ground-truth labels. "
                f"Evaluation requires a known label column (e.g. 'label', 'attack_type', 'class', etc.) to evaluate model predictions."
            )

        raw_labels = df[label_col].tolist()
        actual_labels = [self.canonicalize_class_name(l) for l in raw_labels]

        # 2. STRICT NO-DATA-LEAKAGE: remove target label column from feature matrix
        df_for_model = df.drop(columns=[label_col])

        # 3. Model inference
        predictions, rejected_count = self.predict_dataframe(df_for_model, actual_labels=actual_labels)

        # 4. Compute empirical metrics
        pred_classes = [r["predicted_class"] for r in predictions]
        metrics = self.compute_evaluation_metrics(
            actual_labels=actual_labels,
            predictions=pred_classes,
            dataset_name=filename,
        )

        eval_id = f"eval-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        metrics["id"] = eval_id
        metrics["eval_id"] = eval_id
        metrics["rejected_count"] = rejected_count

        # 5. Persist to storage/evaluations/
        try:
            settings.EVALUATIONS_DIR.mkdir(parents=True, exist_ok=True)
            eval_path = settings.EVALUATIONS_DIR / f"{eval_id}.json"
            eval_path.write_text(json.dumps(metrics, indent=2))
        except Exception as exc:
            logger.warning(f"Failed to persist evaluation {eval_id} to disk: {exc}")

        # 6. Audit logging
        try:
            from app.services.audit_service import audit_service
            audit_service.record_event(
                severity="INFO",
                category="TRAINING",
                message=f"Model evaluation executed for '{filename}': Accuracy {(metrics.get('accuracy', 0)*100):.2f}%, Macro F1 {(metrics.get('macro_f1', 0)*100):.2f}% on {metrics.get('total_samples', 0)} samples.",
                component="MLService",
                details={
                    "eval_id": eval_id,
                    "filename": filename,
                    "accuracy": metrics.get("accuracy"),
                    "macro_f1": metrics.get("macro_f1"),
                    "weighted_f1": metrics.get("weighted_f1"),
                    "false_positive_rate": metrics.get("false_positive_rate"),
                    "false_negative_rate": metrics.get("false_negative_rate"),
                    "total_samples": metrics.get("total_samples"),
                },
            )
        except Exception:
            pass

        return metrics

    def list_saved_evaluations(self) -> List[Dict[str, Any]]:
        """Lists persisted evaluation runs from storage/evaluations/ ordered by timestamp descending."""
        evaluations: List[Dict[str, Any]] = []
        if not settings.EVALUATIONS_DIR.exists():
            return evaluations

        for file_path in settings.EVALUATIONS_DIR.glob("*.json"):
            try:
                data = json.loads(file_path.read_text())
                if isinstance(data, dict) and "accuracy" in data:
                    evaluations.append(data)
            except Exception as exc:
                logger.debug(f"Could not read evaluation file {file_path}: {exc}")

        # Sort descending by evaluated_at or id
        evaluations.sort(
            key=lambda x: str(x.get("evaluated_at") or x.get("evaluatedAt") or x.get("id", "")),
            reverse=True,
        )
        return evaluations

    def get_saved_evaluation(self, eval_id: str) -> Optional[Dict[str, Any]]:
        """Loads a specific evaluation run by ID from disk."""
        eval_path = settings.EVALUATIONS_DIR / f"{eval_id}.json"
        if eval_path.exists():
            try:
                return json.loads(eval_path.read_text())
            except Exception as exc:
                logger.error(f"Error reading evaluation {eval_id}: {exc}")
        return None

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


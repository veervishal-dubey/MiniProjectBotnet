# SentinelFL — Historical Benchmark Experiments & Research Takeaways

This document details the research benchmark experiments conducted on 175,669 IoT network traffic flows comparing Centralized ML versus Federated Learning (Flower / FedAvg) under diverse data distribution conditions.

---

## 1. Experimental Dataset & Setup

- **Benchmark Dataset**: Curated IoT Network Flow Capture (CICIoT / Botnet benchmark).
- **Total Network Flows**: 175,669 flows.
- **Feature Space**: 39 flow attributes (duration, rate, flag counts, protocol flags, packet size statistics).
- **Classification Objective**: 7-class attack category identification:
  1. `Benign`
  2. `DDoS-ACK`
  3. `DDoS-SYN`
  4. `DDoS-TCP`
  5. `Mirai-greeth_flood`
  6. `Mirai-greip_flood`
  7. `Mirai-udpplain`

---

## 2. Experimental Scenarios

| Scenario ID | Training Topology | Partitioning Strategy | Clients ($K$) | Rounds ($T$) | Local Epochs ($E$) | Macro F1 (%) | Accuracy (%) | False Positive Rate (%) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **EXP-01** | Centralized ML | Pooled (No Client Split) | 1 | 20 epochs | N/A | **98.28%** | **98.45%** | **0.82%** |
| **EXP-02** | Federated (FedAvg) | Uniform IID | 5 | 10 | 3 | **97.85%** | **98.02%** | **0.95%** |
| **EXP-03** | Federated (FedAvg) | Dirichlet Non-IID ($\alpha = 0.5$) | 5 | 10 | 3 | **97.12%** | **97.35%** | **1.18%** |
| **EXP-04** | Federated (FedAvg) | Dirichlet Non-IID ($\alpha = 0.1$) | 5 | 10 | 3 | **95.97%** | **96.20%** | **1.64%** |
| **EXP-05** | Federated (FedAvg) | Holdout Edge Filehold | 3 | 5 | 2 | **96.40%** | **96.80%** | **1.42%** |

---

## 3. Dynamic Research Takeaways

1. **Near-Centralized Performance Preservation**:
   Under balanced (IID) federated learning across edge clients, FedAvg achieves a Macro F1 score of **97.85%**, which is within **0.43%** of the centralized baseline (**98.28%**), while eliminating the requirement to transmit raw network traffic to a centralized server.
2. **Robustness Under Extreme Heterogeneity (Non-IID)**:
   Even under severe label skewness ($\alpha = 0.1$, where specific clients observe only a small subset of attack types), FedAvg retains a Macro F1 score of **95.97%** (a minor degradation of 2.31% relative to centralized training).
3. **False Positive Rate (FPR) Containment**:
   Crucially for operational Security Operations Centers (SOCs), the False Positive Rate remains low across all topologies ($0.82\%$ centralized vs. $0.95\%$ IID FL and $1.64\%$ extreme non-IID FL), preventing alert fatigue in live deployments.
4. **Privacy-Preserving Edge Coordination**:
   Edge devices retain full ownership of their network packet logs. Only weight updates ($w_t^k$) are communicated to the aggregation coordinator, achieving compliance with strict privacy standards (GDPR, ISO 27701).

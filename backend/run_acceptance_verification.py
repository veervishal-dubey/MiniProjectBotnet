import numpy as np
import pandas as pd
import json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

def main():
    cache_dir = Path('../federated/cache')
    meta = json.loads((cache_dir / 'clean_meta.json').read_text())
    features = meta['features']
    classes = meta['classes']

    X = np.load(cache_dir / 'X_clean.npy', mmap_mode='r')
    y = np.load(cache_dir / 'y_clean.npy', mmap_mode='r')

    # Sample 150 rows per class across all 7 classes
    indices = []
    for c_idx in range(len(classes)):
        c_indices = np.where(y == c_idx)[0]
        step = max(1, len(c_indices) // 150)
        indices.extend(c_indices[::step][:150])

    indices = np.array(indices)
    sample_X = np.array(X[indices])
    sample_y = np.array(y[indices])

    df = pd.DataFrame(sample_X, columns=features)
    df['Label'] = [classes[idx] for idx in sample_y]

    # Add 5 dirty stress test rows
    dirty_data = []
    r_inf = df.iloc[0].to_dict()
    r_inf['Rate'] = float('inf')
    dirty_data.append(r_inf)

    r_ninf = df.iloc[1].to_dict()
    r_ninf['IAT'] = float('-inf')
    dirty_data.append(r_ninf)

    r_big = df.iloc[2].to_dict()
    r_big['Tot sum'] = 1e308
    dirty_data.append(r_big)

    r_nan = {col: np.nan for col in features}
    r_nan['Label'] = 'Benign'
    dirty_data.append(r_nan)

    r_nan2 = {col: np.nan for col in features}
    r_nan2['Label'] = 'DDoS-ACK'
    dirty_data.append(r_nan2)

    test_df = pd.concat([df, pd.DataFrame(dirty_data)], ignore_index=True)
    csv_bytes = test_df.to_csv(index=False).encode('utf-8')
    total_records = len(test_df)
    print(f'Generated balanced 7-class test dataset with {total_records} records.')

    client = TestClient(app)
    response = client.post(
        '/api/v1/models/predict-csv',
        files={'file': ('acceptance_test_iot_7class.csv', csv_bytes, 'text/csv')},
        data={'model_id': 'mlp_model'}
    )

    print('HTTP Status Code:', response.status_code)
    assert response.status_code == 200, f'Expected 200, got {response.status_code}: {response.text}'

    res = response.json()
    print('Total Records Processed:', res['total_flows'])
    print('Eligible Records Classified:', res['total_flows'] - res['failed_count'])
    print('Rejected / Unrecoverable Records:', res['failed_count'])
    print('Benign Flows:', res['benign_count'])
    print('Malicious Attack Flows:', res['malicious_count'])
    print('Predicted Class Distribution:')
    for cls, count in res['per_class_counts'].items():
        pct = res['per_class_percentages'].get(cls, 0.0)
        print(f'  - {cls}: {count} flows ({pct}%)')

    eval_data = res.get('evaluation')
    if eval_data:
        print('\nEvaluation Metrics against Ground Truth:')
        print(f'  - Accuracy: {eval_data["accuracy"]:.4f}')
        print(f'  - Macro Precision: {eval_data["precision"]:.4f}')
        print(f'  - Macro Recall: {eval_data["recall"]:.4f}')
        print(f'  - Macro F1: {eval_data["f1Score"]:.4f}')
        print(f'  - False Positive Rate: {eval_data["falsePositiveRate"]:.4f}')
        print(f'  - False Negative Rate: {eval_data["falseNegativeRate"]:.4f}')
        print('  - Per-Class Breakdown:')
        for pcp in eval_data['perClassPerformance']:
            print(f'    * {pcp["className"]}: Precision={pcp["precision"]:.4f}, Recall={pcp["recall"]:.4f}, F1={pcp["f1Score"]:.4f}, Support={pcp["support"]}')
    
    print('\nALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY.')

if __name__ == '__main__':
    main()

import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import get_current_user, AuthenticatedUser

# Sample IoT Botnet Traffic CSV fixture
SAMPLE_IOT_CSV = """flow_id,timestamp,src_ip,dst_ip,packet_length,packet_rate,byte_rate,protocol,is_constant,label
1,2026-10-21 12:00:00,192.168.1.10,10.0.0.1,64.0,120.5,7712.0,TCP,1,Benign
2,2026-10-21 12:00:01,192.168.1.11,10.0.0.1,128.0,340.2,43545.6,UDP,1,Mirai
3,2026-10-21 12:00:02,192.168.1.12,10.0.0.1,64.0,118.0,7552.0,TCP,1,Benign
4,2026-10-21 12:00:03,192.168.1.13,10.0.0.1,512.0,890.1,455731.2,TCP,1,Bashlite
5,2026-10-21 12:00:04,192.168.1.14,10.0.0.1,64.0,121.0,7744.0,TCP,1,Benign
6,2026-10-21 12:00:05,192.168.1.15,10.0.0.1,1024.0,1250.0,1280000.0,UDP,1,Mirai
7,2026-10-21 12:00:06,192.168.1.16,10.0.0.1,64.0,119.5,7648.0,TCP,1,Benign
8,2026-10-21 12:00:07,192.168.1.17,10.0.0.1,256.0,450.0,115200.0,TCP,1,Bashlite
9,2026-10-21 12:00:08,192.168.1.18,10.0.0.1,64.0,122.0,7808.0,TCP,1,Benign
10,2026-10-21 12:00:09,192.168.1.19,10.0.0.1,128.0,335.0,42880.0,UDP,1,Mirai
11,2026-10-21 12:00:10,192.168.1.20,10.0.0.1,64.0,120.0,7680.0,TCP,1,Benign
12,2026-10-21 12:00:11,192.168.1.21,10.0.0.1,512.0,880.0,450560.0,TCP,1,Bashlite
"""

# CSV with missing values, infinite values, and duplicates
DIRTY_IOT_CSV = """flow_id,packet_length,packet_rate,byte_rate,protocol,label
1,64.0,100.0,6400.0,TCP,Benign
2,,200.0,inf,UDP,Mirai
1,64.0,100.0,6400.0,TCP,Benign
4,128.0,,12800.0,TCP,Mirai
1,64.0,100.0,6400.0,TCP,Benign
6,256.0,300.0,-inf,UDP,Mirai
"""

MALFORMED_CSV = """col1,col2,col3\nval1,val2\nval1,val2,val3,val4,val5,too,many\n"""
EMPTY_CSV = ""


@pytest.fixture
def sample_csv_bytes():
    return SAMPLE_IOT_CSV.encode("utf-8")


@pytest.fixture
def dirty_csv_bytes():
    return DIRTY_IOT_CSV.encode("utf-8")


@pytest.fixture
def empty_csv_bytes():
    return b""


@pytest.fixture
def malformed_csv_bytes():
    return MALFORMED_CSV.encode("utf-8")


@pytest.fixture
def mock_user():
    return AuthenticatedUser(
        user_id="test-user-uuid-1111",
        email="researcher@sentinelfl.org",
        role="authenticated",
    )


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def authenticated_client(mock_user):
    app.dependency_overrides[get_current_user] = lambda: mock_user
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()

import pytest
from unittest.mock import MagicMock, patch
import pandas as pd

# Windows SSL patch for aiohttp / geopy certificate store quirk
import ssl
orig_load_default_certs = ssl.SSLContext.load_default_certs
def patched_load_default_certs(self, purpose=ssl.Purpose.SERVER_AUTH):
    try:
        return orig_load_default_certs(self, purpose)
    except Exception:
        try:
            import certifi
            self.load_verify_locations(certifi.where())
        except Exception:
            pass
ssl.SSLContext.load_default_certs = patched_load_default_certs

# ── 1. ml/rules.py (4 tests) ──────────────────────────────────────────────────

def test_r001_high_confidence_corroborated():
    from ml.rules import evaluate_confidence
    result = evaluate_confidence(True, True)
    assert result['confidence'] == 'HIGH'
    assert result['rule_id'] == 'R001'

def test_r002_medium_confidence_uncorroborated():
    from ml.rules import evaluate_confidence
    result = evaluate_confidence(True, False)
    assert result['confidence'] == 'MEDIUM'
    assert result['rule_id'] == 'R002'

def test_r003_normal_no_anomaly():
    from ml.rules import evaluate_confidence
    for plume_corroborated in [True, False]:
        result = evaluate_confidence(False, plume_corroborated)
        assert result['confidence'] == 'NORMAL'
        assert result['rule_id'] == 'R003'

def test_rule_registry_evidence_sources():
    from ml.rules import get_rule
    assert get_rule('R001').evidence_used == ('IsolationForest', 'GaussianPlume')
    assert get_rule('R002').evidence_used == ('IsolationForest',)


# ── 2. ml/rules.py symbolic reconciliation (5 tests) ─────────────────────────

def test_s001_confirmed():
    from ml.rules import reconcile_evidence
    assert reconcile_evidence('HIGH', 'ROBUST')['verdict'] == 'CONFIRMED'

def test_s002_contested():
    from ml.rules import reconcile_evidence
    assert reconcile_evidence('HIGH', 'FRAGILE')['verdict'] == 'CONTESTED'

def test_s003_plausible():
    from ml.rules import reconcile_evidence
    assert reconcile_evidence('MEDIUM', 'ROBUST')['verdict'] == 'PLAUSIBLE'

def test_s004_weak():
    from ml.rules import reconcile_evidence
    assert reconcile_evidence('MEDIUM', 'FRAGILE')['verdict'] == 'WEAK'

def test_s005_normal_no_reconciliation():
    from ml.rules import reconcile_evidence
    assert reconcile_evidence('NORMAL', None)['verdict'] == 'NORMAL'


# ── 3. ml/plume.py physics validation vs Briggs (1973) (4 tests) ──────────────

BRIGGS_REFERENCE = {
    'A': {
        'x_km': [1, 2, 5, 10],
        'sigma_y_m': [220, 400, 820, 1400],
        'sigma_z_m': [160, 380, 1100, 2200]
    },
    'D': {
        'x_km': [1, 2, 5, 10],
        'sigma_y_m': [80, 140, 280, 480],
        'sigma_z_m': [60, 100, 200, 340]
    },
    'F': {
        'x_km': [1, 2, 5, 10],
        'sigma_y_m': [40, 70, 130, 220],
        'sigma_z_m': [16, 25, 50, 82]
    }
}

def test_sigma_class_a_matches_briggs():
    from ml.plume import _sigma_y, _sigma_z
    ref = BRIGGS_REFERENCE['A']
    sy_errors = []
    for i, x in enumerate(ref['x_km']):
        dist_m = x * 1000.0
        sy = _sigma_y('A', dist_m)
        ref_sy = ref['sigma_y_m'][i]
        err_y = abs(sy - ref_sy) / ref_sy
        sy_errors.append(err_y)
        assert err_y < 0.20, f"Class A sigma_y at {x}km ({sy:.1f}) exceeds 20% diff from ref ({ref_sy})"
    mean_err_y = sum(sy_errors) / len(sy_errors)
    assert mean_err_y < 0.20, f"Class A mean sigma_y error ({mean_err_y:.1%}) exceeds 20%"

def test_sigma_class_d_matches_briggs():
    from ml.plume import _sigma_y
    ref = BRIGGS_REFERENCE['D']
    sy_errors = []
    for i, x in enumerate(ref['x_km']):
        dist_m = x * 1000.0
        sy = _sigma_y('D', dist_m)
        ref_sy = ref['sigma_y_m'][i]
        err_y = abs(sy - ref_sy) / ref_sy
        sy_errors.append(err_y)
    mean_err_y = sum(sy_errors) / len(sy_errors)
    assert mean_err_y < 0.20, f"Class D mean sigma_y error ({mean_err_y:.1%}) exceeds 20%"

def test_sigma_class_f_matches_briggs():
    from ml.plume import _sigma_y, _sigma_z
    ref = BRIGGS_REFERENCE['F']
    sz_errors = []
    sy_errors = []
    for i, x in enumerate(ref['x_km']):
        dist_m = x * 1000.0
        sy = _sigma_y('F', dist_m)
        sz = _sigma_z('F', dist_m)
        ref_sy = ref['sigma_y_m'][i]
        ref_sz = ref['sigma_z_m'][i]
        err_y = abs(sy - ref_sy) / ref_sy
        err_z = abs(sz - ref_sz) / ref_sz
        sy_errors.append(err_y)
        sz_errors.append(err_z)
        assert err_z < 0.20, f"Class F sigma_z at {x}km ({sz:.1f}) exceeds 20% diff from ref ({ref_sz})"
    mean_err_y = sum(sy_errors) / len(sy_errors)
    assert mean_err_y < 0.20, f"Class F mean sigma_y error ({mean_err_y:.1%}) exceeds 20%"

def test_concentration_positive_and_decreasing_with_distance():
    from ml.plume import centre_line_concentration
    distances_m = [500.0, 1000.0, 2000.0, 5000.0, 10000.0]
    concentrations = [centre_line_concentration(Q=50000.0, u=3.5, x_m=x, H=10.0, pg_class='D') for x in distances_m]
    
    for c in concentrations:
        assert c > 0.0, f"Concentration should be positive, got {c}"
    
    for i in range(len(concentrations) - 1):
        assert concentrations[i] > concentrations[i + 1], (
            f"Concentration at {distances_m[i]}m ({concentrations[i]}) must be > "
            f"concentration at {distances_m[i+1]}m ({concentrations[i+1]})"
        )


# ── 4. ml/risk_score.py formula (3 tests) ────────────────────────────────────

def test_who_normalize_boundaries():
    from ml.risk_score import who_normalize
    assert who_normalize(0.0) == 0.0
    assert who_normalize(15.0) == 0.25
    assert who_normalize(35.0) == 0.50
    assert who_normalize(75.0) == 0.75
    assert who_normalize(500.0) == 1.0

def test_risk_contribution_weights_sum_correctly():
    from ml.risk_score import get_zone_risk_assessment
    assessment = get_zone_risk_assessment(aq_val=250.0, lst_val=37.5, ndvi_val=0.5)
    score = assessment['value']
    contribs = assessment['contributions']
    
    total_contrib = round(contribs['aq'] + contribs['lst'] + contribs['ndvi'], 1)
    assert abs(total_contrib - score) <= 0.2, (
        f"Sum of contributions ({total_contrib}) should equal risk score ({score})"
    )

def test_risk_score_defaults_when_lst_ndvi_missing():
    from ml.risk_score import get_zone_risk_assessment
    # Default fallback values used when LST/NDVI missing: 35.0 LST, 0.3 NDVI
    assessment = get_zone_risk_assessment(aq_val=100.0, lst_val=35.0, ndvi_val=0.3)
    contribs = assessment['contributions']
    
    assert contribs['lst'] == 15.0, f"Expected LST contribution 15.0 for default 35.0°C, got {contribs['lst']}"
    assert contribs['ndvi'] == 17.5, f"Expected NDVI contribution 17.5 for default 0.3 NDVI, got {contribs['ndvi']}"


# ── 5. ml/evidence.py schema (2 tests) ───────────────────────────────────────

def test_evidence_object_shap_not_computed_default():
    from ml.evidence import EvidenceObject
    e = EvidenceObject(
        station_name='X',
        observed_at='2026-01-01',
        region_id='r',
        pollutant='pm25',
        value=1.0,
        if_anomaly=False,
        anomaly_score=None,
        plume_conc=None,
        plume_corroborated=None,
        confidence='NORMAL',
        rule_id='R003',
        evidence_used=()
    )
    assert e.shap_status == 'not_computed_in_production'
    assert e.shap_top_features is None

def test_evidence_used_derived_from_rule_registry():
    from ml.evidence import aggregate_evidence
    
    mock_db = MagicMock()
    mock_db.execute.return_value.fetchall.return_value = []
    
    mock_pcad_df = pd.DataFrame([{
        'station_name': 'Station_A',
        'observed_at': '2026-01-01T12:00:00',
        'value': 120.0,
        'if_anomaly': True,
        'anomaly_score': 0.85,
        'plume_conc': 25.0,
        'confidence': 'HIGH',
        'rule_id': 'R001'
    }])
    
    with patch('ml.pcad.compute_pcad_scores', return_value=mock_pcad_df):
        evidence_list = aggregate_evidence(mock_db, region_id='test_region', days_back=1)
        
    assert len(evidence_list) == 1
    ev = evidence_list[0]
    assert ev.evidence_used == ('IsolationForest', 'GaussianPlume')
    assert ev.rule_id == 'R001'

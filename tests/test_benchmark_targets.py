from unittest.mock import patch

from spidercss.benchmark import benchmark_CAO_state_prep


def _fake_target_run(**kwargs):
    return [{"reuse_target": kwargs["reuse_target"].value}]


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_benchmark_runs_all_reuse_targets_by_default(run_target):
    stats = benchmark_CAO_state_prep("test_code", True)

    assert [item["reuse_target"] for item in stats] == [
        "qubits",
        "balanced",
        "depth",
    ]
    assert run_target.call_count == 3
    assert all(call.kwargs["reuse_decoder"] for call in run_target.call_args_list)


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_benchmark_can_run_one_explicit_target(run_target):
    stats = benchmark_CAO_state_prep(
        "test_code", True, reuse_targets="balanced"
    )

    assert stats == [{"reuse_target": "balanced"}]
    assert run_target.call_count == 1


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_singular_reuse_target_alias_remains_supported(run_target):
    stats = benchmark_CAO_state_prep(
        "test_code", True, reuse_target="depth"
    )

    assert stats == [{"reuse_target": "depth"}]
    assert run_target.call_count == 1

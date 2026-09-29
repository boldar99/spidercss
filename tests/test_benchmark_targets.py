from unittest.mock import patch

from spidercss.benchmark import BENCHMARK_REUSE_TARGETS, benchmark_CAO_state_prep


def _fake_target_run(**kwargs):
    return [{"reuse_target": kwargs["reuse_target"].value}]


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_benchmark_runs_all_reuse_targets_by_default(run_target):
    stats = benchmark_CAO_state_prep("7_1_3", True)

    assert [item["reuse_target"] for item in stats] == [
        target.value for target in BENCHMARK_REUSE_TARGETS
    ]
    assert run_target.call_count == len(BENCHMARK_REUSE_TARGETS)
    assert all(call.kwargs["reuse_decoder"] for call in run_target.call_args_list)


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_benchmark_can_run_one_explicit_target(run_target):
    stats = benchmark_CAO_state_prep(
        "7_1_3", True, reuse_targets="balanced"
    )

    assert stats == [{"reuse_target": "balanced"}]
    assert run_target.call_count == 1


@patch(
    "spidercss.benchmark._benchmark_CAO_state_prep_target",
    side_effect=_fake_target_run,
)
def test_singular_reuse_target_alias_remains_supported(run_target):
    stats = benchmark_CAO_state_prep(
        "7_1_3", True, reuse_target="depth"
    )

    assert stats == [{"reuse_target": "depth"}]
    assert run_target.call_count == 1

import unittest
from unittest.mock import patch

import numpy as np
import stim

from spidercss.css_state import prepare_css_state


class PrepareCssStateTest(unittest.TestCase):
    @patch("spidercss.css_state.row_optimized_cat_at_origin")
    @patch("spidercss.css_state.load_qecc")
    def test_compiles_bell_state_and_keeps_data_qubits_first(
        self, load_qecc, prepare_block
    ):
        h = np.array([[1, 1]], dtype=np.int8)
        logical = np.array([[1, 0]], dtype=np.int8)
        load_qecc.return_value = True, h, h, logical, logical, 3

        def make_block(_matrix, _distance, *, basis, **_kwargs):
            measurement = "M" if basis == "Z" else "MX"
            reset = "R" if basis == "Z" else "RX"
            return stim.Circuit(
                f"{reset} 0 1\n{measurement} 2\nDETECTOR rec[-1]"
            )

        prepare_block.side_effect = make_block
        logical_state = stim.Circuit("M 0\nMX 1\nCX 1 0")

        circuit = prepare_css_state(logical_state, "test_code")

        self.assertEqual(circuit.num_qubits, 6)
        self.assertEqual(
            str(circuit).splitlines(),
            [
                "R 0 1",
                "M 4",
                "DETECTOR rec[-1]",
                "RX 2 3",
                "MX 5",
                "DETECTOR rec[-1]",
                "CX 2 0 3 1",
            ],
        )
        prepared_bases = [
            call.kwargs["basis"] for call in prepare_block.call_args_list
        ]
        self.assertEqual(prepared_bases, ["Z", "X"])

    def test_rejects_unsupported_operations(self):
        with self.assertRaisesRegex(ValueError, "Unsupported logical operation 'H'"):
            prepare_css_state(stim.Circuit("H 0"), "test_code")

    def test_rejects_repeated_preparation(self):
        with self.assertRaisesRegex(ValueError, "prepared more than once"):
            prepare_css_state(stim.Circuit("R 0\nMX 0"), "test_code")

    def test_rejects_cnot_before_preparation(self):
        with self.assertRaisesRegex(ValueError, "uses unprepared qubit"):
            prepare_css_state(stim.Circuit("CX 0 1\nR 0 1"), "test_code")

    def test_rejects_sparse_logical_qubits(self):
        with self.assertRaisesRegex(ValueError, "missing: 0"):
            prepare_css_state(stim.Circuit("R 1"), "test_code")

    def test_rejects_inverted_preparation_target(self):
        with self.assertRaisesRegex(ValueError, "plain qubit targets"):
            prepare_css_state(stim.Circuit("M !0"), "test_code")

    def test_rejects_repeat_blocks(self):
        with self.assertRaisesRegex(ValueError, "REPEAT blocks"):
            prepare_css_state(stim.Circuit("REPEAT 2 {\nR 0\n}"), "test_code")

    @patch("spidercss.css_state.load_qecc")
    def test_rejects_codes_with_multiple_logical_qubits(self, load_qecc):
        h = np.array([[1, 1, 0]], dtype=np.int8)
        logicals = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.int8)
        load_qecc.return_value = False, h, h, logicals, logicals, 2

        with self.assertRaisesRegex(ValueError, r"\[\[n, 1, d\]\]"):
            prepare_css_state(stim.Circuit("R 0"), "test_code")


if __name__ == "__main__":
    unittest.main()

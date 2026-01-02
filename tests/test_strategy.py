import numpy as np
import pandas as pd

from eth_macd_strategy import (
    StrategyInputs,
    TrailingStopConfig,
    build_trade_plan,
    compute_indicators,
    compute_trailing_stop,
    determine_signal,
    pct_to_price,
)


def make_trending_dataframe() -> pd.DataFrame:
    timestamps = np.arange(0, 250)
    descending = np.linspace(2000, 1900, 125)
    ascending = np.linspace(1900, 2100, 125)
    closes = np.concatenate([descending, ascending])
    highs = closes * 1.02
    lows = closes * 0.98
    volumes = np.full_like(closes, 1200, dtype=float)
    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": closes,
            "close": closes,
            "high": highs,
            "low": lows,
            "volume": volumes,
        }
    )


def test_trailing_stop_levels_progress():
    config = TrailingStopConfig(start_roi=10.0, step_roi=8.0, stop_loss_roi=9.0)
    entry_price = 2000.0

    # Before activation, stop is anchored at -9% ROI
    initial_stop = compute_trailing_stop("long", entry_price, peak_roi=5.0, config=config)
    assert initial_stop == pct_to_price("long", entry_price, -9.0)

    # At 10% ROI, stop should trail to 2% ROI behind
    activated_stop = compute_trailing_stop("long", entry_price, peak_roi=10.0, config=config)
    expected_activated_price = pct_to_price("long", entry_price, 2.0)
    assert activated_stop == expected_activated_price

    # Further profit should ratchet the stop forward, never backward
    higher_peak_stop = compute_trailing_stop("long", entry_price, peak_roi=26.0, config=config, current_stop_price=activated_stop)
    expected_higher_price = pct_to_price("long", entry_price, 18.0)
    assert higher_peak_stop == expected_higher_price


def test_trade_plan_and_signal_generation_long_bias():
    df = make_trending_dataframe()
    inputs = StrategyInputs(
        macd_delta_min=0.0001,
        bb_min_expansion=0.05,
        strength_threshold="Weak",
        weight_macd=0.15,
        weight_bb=0.8,
        weight_rsi=0.05,
        use_trend_filter=True,
        use_volume_filter=False,
    )
    indicators = compute_indicators(df, inputs)
    indicators["delta_series"] = indicators["delta_series"].copy()
    indicators["delta_series"].iloc[-2] = -0.01  # force crossover
    indicators["delta_series"].iloc[-1] = 0.02
    indicators["macd_delta"] = 0.02
    side, score_state = determine_signal(indicators, inputs)

    # The synthetic uptrend should yield a long-side bias with relaxed thresholds
    assert side == "long", f"Expected long bias, got {side}, scores {score_state}"

    trailing = TrailingStopConfig()
    plan = build_trade_plan(
        side=side,
        entry_price=indicators["close"],
        indicators=indicators,
        inputs=inputs,
        trailing=trailing,
        balance_usdt=5000.0,
        position_percent=1.0,
    )

    assert plan.size > 0
    assert plan.stop_loss_price < plan.entry_price

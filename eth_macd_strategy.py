"""
/**
 * Strategy: MACD Strategy – Advanced Exit Logic + Signal Strength Filter (KuCoin Python Port)
 * Market: ETH/USDT Perpetual Futures (100× leverage)
 * Author: Codex-generated
 * Version: 1.0
 */
"""
import json
import logging
import math
import os
import sys
import time
from dataclasses import dataclass, asdict
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from kucoin_futures.client import Market, Trade, User

load_dotenv()

# =============================================================================
# CONSTANTS & DEFAULTS
# =============================================================================
LEVERAGE = 100  # 100× leverage as required
SYMBOL = "ETHUSDTM"
CONTRACT_MULTIPLIER = 1.0  # KuCoin linear contracts are quoted 1 USDT per point

# =============================================================================
# DATA CLASSES
# =============================================================================
@dataclass
class StrategyInputs:
    fast_length: int = 9
    slow_length: int = 23
    signal_length: int = 5
    macd_delta_min: float = 0.01
    bb_min_expansion: float = 0.5
    bars_to_kill: int = 30
    atr_trail_mult: float = 1.5
    min_profit_roi: float = float(os.getenv("KUCOIN_MIN_PROFIT_ROI", "1.0"))
    normalization_lookback: int = 200
    weight_macd: float = 0.45
    weight_bb: float = 0.35
    weight_rsi: float = 0.20
    strength_threshold: str = "Medium"
    use_trend_filter: bool = True
    use_volume_filter: bool = False
    volume_ma_length: int = 50

    def validate(self) -> None:
        for name in ("fast_length", "slow_length", "signal_length", "bars_to_kill", "normalization_lookback", "volume_ma_length"):
            value = getattr(self, name)
            if value < 1:
                raise ValueError(f"{name} must be >= 1; received {value}")
        if self.macd_delta_min < 0 or self.bb_min_expansion < 0:
            raise ValueError("macd_delta_min and bb_min_expansion must be non-negative")
        if not 0 <= self.weight_macd <= 1 or not 0 <= self.weight_bb <= 1 or not 0 <= self.weight_rsi <= 1:
            raise ValueError("indicator weights must be between 0 and 1")
        total_weight = self.weight_macd + self.weight_bb + self.weight_rsi
        if not math.isclose(total_weight, 1.0, rel_tol=1e-6):
            raise ValueError(f"indicator weights must sum to 1; received {total_weight}")


@dataclass
class TrailingStopConfig:
    start_roi: float = 10.0   # Trailing activates after 10% ROI
    step_roi: float = 8.0     # Every additional 8% ROI moves the stop
    stop_loss_roi: float = 9.0  # Static SL until trailing engages

    def validate(self) -> None:
        if self.start_roi <= 0 or self.step_roi <= 0 or self.stop_loss_roi <= 0:
            raise ValueError("Trailing configuration values must be positive")


@dataclass
class TradePlan:
    side: str
    entry_price: float
    stop_loss_price: float
    trailing_stop_price: float
    take_profit_price: float
    size: int
    peak_roi: float
    timestamp_ms: int

    def as_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def pct_to_price(side: str, entry_price: float, roi_percent: float, leverage: int = LEVERAGE) -> float:
    """
    Convert ROI% (on margin) to a raw price level.
    Positive ROI raises price for longs and lowers price for shorts.
    """
    price_delta_ratio = (roi_percent / leverage) / 100
    return entry_price * (1 + price_delta_ratio) if side == "long" else entry_price * (1 - price_delta_ratio)


def price_to_roi(side: str, entry_price: float, current_price: float, leverage: int = LEVERAGE) -> float:
    """
    Convert a price movement into ROI% on margin.
    """
    if entry_price <= 0:
        raise ValueError("entry_price must be positive")
    price_change = (current_price - entry_price) / entry_price * 100
    raw_roi = price_change * leverage
    return raw_roi if side == "long" else -raw_roi


def normalize_series(series: pd.Series, lookback: int) -> float:
    if series.empty:
        return 0.0
    window = series.tail(lookback)
    low, high = window.min(), window.max()
    if math.isclose(low, high):
        return 0.0
    return max(0.0, min(100.0, (series.iloc[-1] - low) / (high - low) * 100))


def compute_indicators(df: pd.DataFrame, inputs: StrategyInputs) -> Dict[str, float]:
    """
    Compute MACD, RSI, Bollinger Bands, ATR percent, and normalized strength metrics.
    All calculations mirror the provided Pine Script defaults.
    """
    closes = df["close"]
    highs = df["high"]
    lows = df["low"]
    volumes = df["volume"]

    fast_ema = closes.ewm(span=inputs.fast_length, adjust=False).mean()
    slow_ema = closes.ewm(span=inputs.slow_length, adjust=False).mean()
    macd_line = fast_ema - slow_ema
    signal = macd_line.ewm(span=inputs.signal_length, adjust=False).mean()
    delta = macd_line - signal
    macd_slope = delta.diff()

    rsi = ta_rsi(closes, length=14)
    atr = ta_atr(highs, lows, closes, length=14)

    bb_basis = closes.rolling(window=20).mean()
    bb_dev = 2 * closes.rolling(window=20).std(ddof=0)
    bb_upper = bb_basis + bb_dev
    bb_lower = bb_basis - bb_dev
    bb_width = ((bb_upper - bb_lower) / closes) * 100

    vol_ma = volumes.rolling(window=inputs.volume_ma_length).mean()

    indicators = {
        "close": closes.iloc[-1],
        "fast_ema": fast_ema.iloc[-1],
        "slow_ema": slow_ema.iloc[-1],
        "macd_delta": delta.iloc[-1],
        "macd_slope": macd_slope.iloc[-1],
        "bb_width": bb_width.iloc[-1],
        "rsi": rsi.iloc[-1],
        "atr": atr.iloc[-1],
        "atr_percent": (atr.iloc[-1] / closes.iloc[-1]) * 100 if closes.iloc[-1] else 0.0,
        "bb_upper": bb_upper.iloc[-1],
        "bb_lower": bb_lower.iloc[-1],
        "vol_ma": vol_ma.iloc[-1],
        "volume": volumes.iloc[-1],
        "macd_line": macd_line.iloc[-1],
        "macd_signal": signal.iloc[-1],
        "delta_series": delta,
        "bb_width_series": bb_width,
        "rsi_series": rsi,
    }

    return indicators


def ta_rsi(series: pd.Series, length: int) -> pd.Series:
    """Plain RSI without external dependencies."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=length, min_periods=length).mean()
    avg_loss = loss.rolling(window=length, min_periods=length).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def ta_atr(highs: pd.Series, lows: pd.Series, closes: pd.Series, length: int) -> pd.Series:
    prev_close = closes.shift(1)
    tr = pd.concat(
        [
            highs - lows,
            (highs - prev_close).abs(),
            (lows - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(window=length, min_periods=length).mean().bfill()


def determine_signal(indicators: Dict[str, float], inputs: StrategyInputs) -> Tuple[Optional[str], Dict[str, float]]:
    """
    Determine BUY/SELL/HOLD based on MACD cross, BB width, RSI scoring, and signal strength threshold.
    Returns the side ('long' or 'short') and the score breakdown.
    """
    macd_delta = indicators["macd_delta"]
    delta_series = indicators["delta_series"]
    bb_width_series = indicators["bb_width_series"]
    rsi_series = indicators["rsi_series"]

    if len(delta_series) < 2:
        return None, {"reason": "insufficient data for MACD crossover"}

    # Cross detection
    crossed_above = delta_series.iloc[-2] <= 0 and macd_delta > 0
    crossed_below = delta_series.iloc[-2] >= 0 and macd_delta < 0

    base_long = crossed_above and macd_delta > inputs.macd_delta_min and indicators["bb_width"] > inputs.bb_min_expansion
    base_short = crossed_below and macd_delta < -inputs.macd_delta_min and indicators["bb_width"] > inputs.bb_min_expansion

    trend_ok_long = (not inputs.use_trend_filter) or indicators["fast_ema"] > indicators["slow_ema"]
    trend_ok_short = (not inputs.use_trend_filter) or indicators["fast_ema"] < indicators["slow_ema"]
    volume_ok = (not inputs.use_volume_filter) or (indicators["volume"] > indicators["vol_ma"])

    # Normalization for strength score
    macd_mag = normalize_series(delta_series.abs(), inputs.normalization_lookback)
    macd_imp_pos = normalize_series(delta_series.diff().clip(lower=0), inputs.normalization_lookback)
    macd_imp_neg = normalize_series(-delta_series.diff().clip(upper=0), inputs.normalization_lookback)
    macd_comp_long = 0.7 * macd_mag + 0.3 * macd_imp_pos
    macd_comp_short = 0.7 * macd_mag + 0.3 * macd_imp_neg
    bb_comp = normalize_series(bb_width_series, inputs.normalization_lookback)
    rsi_comp_long = clamp(100.0 * (70.0 - indicators["rsi"]) / 40.0)
    rsi_comp_short = clamp(100.0 * (indicators["rsi"] - 30.0) / 40.0)

    score_long = inputs.weight_macd * macd_comp_long + inputs.weight_bb * bb_comp + inputs.weight_rsi * rsi_comp_long
    score_short = inputs.weight_macd * macd_comp_short + inputs.weight_bb * bb_comp + inputs.weight_rsi * rsi_comp_short

    thresholds = {"Weak": 60.0, "Medium": 75.0, "Strong": 83.0}
    required = thresholds.get(inputs.strength_threshold, thresholds["Medium"])
    strength_ok_long = score_long >= required
    strength_ok_short = score_short >= required

    side = None
    if base_long and trend_ok_long and volume_ok and strength_ok_long:
        side = "long"
    elif base_short and trend_ok_short and volume_ok and strength_ok_short:
        side = "short"

    score_state = {
        "score_long": score_long,
        "score_short": score_short,
        "required": required,
        "macd_component_long": macd_comp_long,
        "macd_component_short": macd_comp_short,
        "bb_component": bb_comp,
        "rsi_component_long": rsi_comp_long,
        "rsi_component_short": rsi_comp_short,
    }

    return side, score_state


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def determine_position_size(
    balance_usdt: float,
    entry_price: float,
    position_percent: float,
    leverage: int = LEVERAGE,
    multiplier: float = CONTRACT_MULTIPLIER,
) -> int:
    if balance_usdt <= 0:
        raise ValueError("Account balance must be positive to size a position")
    margin_used = balance_usdt * (position_percent / 100)
    position_value = margin_used * leverage
    size = math.floor(position_value / (entry_price * multiplier))
    return max(size, 1)


def compute_trailing_stop(
    side: str,
    entry_price: float,
    peak_roi: float,
    config: TrailingStopConfig,
    current_stop_price: Optional[float] = None,
) -> float:
    """
    Trailing stop begins once ROI reaches start_roi and stays step_roi behind the peak ROI.
    Until then, the stop is anchored at -stop_loss_roi.
    """
    stop_price = pct_to_price(side, entry_price, -config.stop_loss_roi)
    if peak_roi >= config.start_roi:
        target_roi = max(0.0, peak_roi - config.step_roi)
        trailing_price = pct_to_price(side, entry_price, target_roi)
        stop_price = max(stop_price, trailing_price) if side == "long" else min(stop_price, trailing_price)

    if current_stop_price is not None:
        if side == "long":
            stop_price = max(stop_price, current_stop_price)
        else:
            stop_price = min(stop_price, current_stop_price)
    return stop_price


def build_trade_plan(
    side: str,
    entry_price: float,
    indicators: Dict[str, float],
    inputs: StrategyInputs,
    trailing: TrailingStopConfig,
    balance_usdt: float,
    position_percent: float,
) -> TradePlan:
    peak_roi = 0.0
    stop_loss_price = pct_to_price(side, entry_price, -trailing.stop_loss_roi)
    trailing_stop_price = compute_trailing_stop(side, entry_price, peak_roi, trailing, stop_loss_price)
    take_profit_price = pct_to_price(side, entry_price, inputs.min_profit_roi)
    size = determine_position_size(balance_usdt, entry_price, position_percent)
    return TradePlan(
        side=side,
        entry_price=entry_price,
        stop_loss_price=stop_loss_price,
        trailing_stop_price=trailing_stop_price,
        take_profit_price=take_profit_price,
        size=size,
        peak_roi=peak_roi,
        timestamp_ms=int(time.time() * 1000),
    )


# =============================================================================
# KUCOIN API HELPERS
# =============================================================================
def build_clients(base_url: str) -> Tuple[Market, Trade, User]:
    api_key = os.getenv("KUCOIN_API_KEY")
    api_secret = os.getenv("KUCOIN_API_SECRET")
    api_passphrase = os.getenv("KUCOIN_API_PASSPHRASE")
    if not api_key or not api_secret or not api_passphrase:
        raise ValueError("Missing KuCoin credentials. Set KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE.")

    is_sandbox = os.getenv("KUCOIN_USE_SANDBOX", "false").lower() == "true"
    market = Market(key=api_key, secret=api_secret, passphrase=api_passphrase, is_sandbox=is_sandbox, url=base_url)
    trade = Trade(key=api_key, secret=api_secret, passphrase=api_passphrase, is_sandbox=is_sandbox, url=base_url)
    user = User(key=api_key, secret=api_secret, passphrase=api_passphrase, is_sandbox=is_sandbox, url=base_url)
    return market, trade, user


def fetch_candles(market: Market, timeframe: str, limit: int = 400) -> pd.DataFrame:
    """
    Fetch OHLCV data for ETH/USDT perpetual futures.
    """
    granularity_map = {
        "1min": 60,
        "5min": 300,
        "15min": 900,
        "30min": 1800,
        "1hour": 3600,
        "4hour": 14400,
        "1day": 86400,
    }
    if timeframe not in granularity_map:
        raise ValueError(f"Unsupported timeframe {timeframe}")

    granularity = granularity_map[timeframe]
    end_at = int(time.time())
    start_at = end_at - granularity * limit
    raw = market.get_kline(SYMBOL, granularity, startAt=start_at, endAt=end_at)
    if not raw:
        raise RuntimeError("No kline data returned from KuCoin")

    df = pd.DataFrame(
        raw,
        columns=["timestamp", "open", "close", "high", "low", "volume", "turnover"],
    )
    df[["timestamp", "open", "close", "high", "low", "volume"]] = df[
        ["timestamp", "open", "close", "high", "low", "volume"]
    ].astype(float)
    df.sort_values("timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def fetch_account_balance(user: User) -> float:
    overview = user.get_account_overview("USDT")
    balance = float(overview.get("availableBalance", 0))
    return balance


def submit_orders(plan: TradePlan, trade: Trade, execute: bool) -> None:
    if not execute:
        logging.info("Dry run enabled; not submitting orders to KuCoin.")
        logging.info(plan.as_json())
        return

    side_map = {"long": "buy", "short": "sell"}
    side = side_map[plan.side]

    # Entry order
    entry_order = trade.create_market_order(
        symbol=SYMBOL,
        side=side,
        leverage=str(LEVERAGE),
        size=str(plan.size),
    )
    logging.info("Entry order placed: %s", entry_order)

    # Stop loss
    stop_side = "sell" if plan.side == "long" else "buy"
    stop_order = trade.create_stop_order(
        symbol=SYMBOL,
        side=stop_side,
        leverage=str(LEVERAGE),
        stop="down" if plan.side == "long" else "up",
        stopPrice=round(plan.stop_loss_price, 2),
        size=str(plan.size),
        reduceOnly=True,
    )
    logging.info("Stop order placed: %s", stop_order)

    # Take profit
    tp_order = trade.create_stop_order(
        symbol=SYMBOL,
        side=stop_side,
        leverage=str(LEVERAGE),
        stop="down" if plan.side == "long" else "up",
        stopPrice=round(plan.take_profit_price, 2),
        size=str(plan.size),
        reduceOnly=True,
    )
    logging.info("Take-profit order placed: %s", tp_order)


# =============================================================================
# MAIN WORKFLOW
# =============================================================================
def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logging.info("Starting MACD + Signal Strength strategy for %s with %sx leverage", SYMBOL, LEVERAGE)

    inputs = StrategyInputs()
    trailing = TrailingStopConfig()
    inputs.validate()
    trailing.validate()

    timeframe = os.getenv("KUCOIN_TIMEFRAME", "5min")
    position_percent = float(os.getenv("KUCOIN_POSITION_SIZE_PERCENT", "1.0"))
    execute_trades = os.getenv("KUCOIN_EXECUTE_TRADES", "false").lower() == "true"
    base_url = os.getenv("KUCOIN_FUTURES_URL", "https://api-futures.kucoin.com")

    try:
        market, trade, user = build_clients(base_url)
    except Exception as exc:
        logging.error("Failed to initialize KuCoin clients: %s", exc)
        return

    try:
        candles = fetch_candles(market, timeframe)
    except Exception as exc:
        logging.error("Failed to fetch candles: %s", exc)
        return

    try:
        indicators = compute_indicators(candles, inputs)
        side, score_state = determine_signal(indicators, inputs)
    except Exception as exc:
        logging.error("Indicator computation failed: %s", exc)
        return

    if side is None:
        logging.info("No actionable signal. Scores: %s", score_state)
        return

    try:
        balance = fetch_account_balance(user)
    except Exception as exc:
        logging.warning("Unable to fetch account balance, defaulting to 0: %s", exc)
        balance = 0.0

    entry_price = indicators["close"]
    plan = build_trade_plan(
        side=side,
        entry_price=entry_price,
        indicators=indicators,
        inputs=inputs,
        trailing=trailing,
        balance_usdt=balance,
        position_percent=position_percent,
    )

    logging.info("Signal detected: %s", side.upper())
    logging.info("Score state: %s", score_state)
    logging.info("Trade plan: %s", plan.as_json())

    try:
        submit_orders(plan, trade, execute_trades)
    except Exception as exc:
        logging.error("Order submission failed: %s", exc)


if __name__ == "__main__":
    main()

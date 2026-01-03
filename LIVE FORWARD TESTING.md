# LIVE FORWARD TESTING (DOM + LATENCY REALISM)

Implement a forward-testing subsystem that runs live, without placing orders (shadow mode), and optionally in paper mode.

Goals:
- Validate DOM gates and limit-entry assumptions in real-time.
- Measure signal quality under latency and feed conditions.

Features:
- Shadow trader:
  - listens to live WS + DOM
  - generates signals using candidate configs from /configs/top_configs/
  - simulates fills using the same fill model
  - records hypothetical trades and outcomes in JSONL
- A/B framework:
  - run multiple configs simultaneously (N=5–20) on the same stream
  - isolate per-config performance and compute live metrics
  - tag each trade with regime + data-quality stats (latency, feed jitter)
- Safety:
  - NEVER trade live by default
  - live trading enabled only behind an explicit ENV flag

Deliver:
- research/forward/shadow_runner.ts
- research/forward/ab_runner.ts
- research/forward/live_metrics.ts
- dashboard endpoint to view “top configs in live forward test” in real time


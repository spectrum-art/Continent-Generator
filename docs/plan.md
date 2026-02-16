# Map Explorer Plan

## Milestone 6: Rivers + Polish + Stress Mode

- [x] `A1` add `river` tile type and renderer color support.
- [x] Run `npm test` and `npm run build` after `A1`.
- [x] `A2` implement deterministic river source selection + downhill tracing + termination tests.
- [x] Run `npm test` and `npm run build` after `A2`.
- [x] `A3` add river coverage/connectivity tests and tune constants.
- [x] Completed 8 tuning iterations and locked constants.
- [x] Strong river coverage target met (`0.5%..4%` in 256x256 sample).
- [x] Connectivity floor locked at component length >= `50` after iteration cap.
- [x] Run `npm test` and `npm run build` after `A3`.
- [ ] Lakes.
Deferred in Milestone 6 to keep deterministic river + streaming + stress checkpoints stable.
- [x] `B1` visual polish: elevation shading + shoreline tint.
- [x] `B2` visual polish: zoom-dependent outlines + minimap rate label + legend.
- [x] Run `npm test` and `npm run build` after `B1`/`B2`.
- [x] `C1` stress mode: autopan + counters + reset stats.
- [x] `C2` stress telemetry: chunk-band tracking + perf EMA guardrails.
- [x] Run `npm test` and `npm run build` after `C1`/`C2`.
- [x] `D` update docs/spec and docs/plan with achieved scope and deferred items.

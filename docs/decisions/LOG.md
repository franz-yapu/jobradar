# Decision log

## 2026-11-02 – Kafka not used in v1; SQS behind a port
- **Decision:** No Kafka in SDD-001..005. The async hand-off to the AI worker uses SQS, behind a domain port (e.g. `ScoringQueue` / `PostingEventPublisher`).
- **Why:** Single user, low volume. SQS covers queue, retries and DLQ with near-zero ops and fits the AWS free tier. MSK is costly and a local broker adds weight. ADR-0001 already rejects unneeded complexity.
- **Revisit if:** we need event replay (re-score old postings with a new prompt) or several independent consumers per event.
- **Escape hatch:** add a `KafkaScoringQueue` adapter (Redpanda locally) as an optional SDD-006 + ADR, without touching use cases.

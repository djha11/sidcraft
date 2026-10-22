# ADR 0001: Begin with a modular monolith

## Decision

Use one deployable API with strongly separated domain modules and background workers.

## Reason

The MVP needs rapid iteration and transactional correctness more than independently scalable services. Module boundaries and an event outbox preserve a future extraction path.

## Revisit when

A measured workload has materially different scaling, availability, or deployment requirements.


# Unified Service Scheduler

**Keyloop Technical Assessment — Scenario A**

A RESTful backend service for scheduling vehicle service appointments at dealerships, with real-time resource constraint checking (ServiceBay + Technician availability).

## Tech Stack

- **NestJS** + TypeScript
- **PostgreSQL** (with `SELECT FOR UPDATE SKIP LOCKED` for concurrency safety)
- **Prisma ORM**
- **Swagger/OpenAPI** (auto-generated docs)
- **Jest** (unit tests)
- **Docker + docker-compose**

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & docker-compose (recommended), OR a local PostgreSQL instance

### 1. Clone & install

```bash
git clone <your-repo-url>
cd service-scheduler
yarn install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed
```

### 3. Start PostgreSQL

```bash
docker-compose up db -d
```

### 4. Push database schema

```bash
yarn db:push
```

### 5. Seed test data (optional)

```bash
yarn db:seed
```

### 6. Start the server

```bash
yarn start:dev
```

Server runs at: `http://localhost:3000`  
Swagger docs: `http://localhost:3000/api/docs`

---

## Running with Docker (full stack)

```bash
docker-compose up --build
```

---

## Running Tests

```bash
# Unit tests (no database required)
yarn test

# End-to-end tests (no database required — services are mocked)
yarn test:e2e

# With coverage
yarn test:cov

# Watch mode
yarn test:watch
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/appointments` | Book an appointment |
| `GET` | `/appointments` | List appointments |
| `GET` | `/appointments/:id` | Get appointment |
| `DELETE` | `/appointments/:id` | Cancel appointment |
| `GET` | `/health` | Health check |

Full API docs with request/response schemas: `http://localhost:3000/api/docs`

### Example: Book an Appointment

```bash
curl -X POST http://localhost:3000/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<uuid>",
    "vehicleId": "<uuid>",
    "dealershipId": "<uuid>",
    "serviceType": "OIL_CHANGE",
    "desiredStartTime": "2026-06-01T09:00:00.000Z",
    "notes": "Please check tyre pressure too"
  }'
```

**Success (201):**
```json
{
  "id": "uuid",
  "status": "CONFIRMED",
  "serviceType": "OIL_CHANGE",
  "startTime": "2026-06-01T09:00:00.000Z",
  "endTime": "2026-06-01T10:00:00.000Z",
  "technician": { "id": "...", "name": "John Smith" },
  "serviceBay": { "id": "...", "name": "Bay 2" },
  ...
}
```

**Conflict (409):**
```json
{
  "statusCode": 409,
  "message": "No service bay available for the requested time slot"
}
```

### Supported Service Types

| Type | Duration |
|---|---|
| `OIL_CHANGE` | 60 min |
| `TIRE_ROTATION` | 45 min |
| `BRAKE_REPAIR` | 120 min |
| `FULL_SERVICE` | 180 min |
| `INSPECTION` | 30 min |
| `BATTERY_REPLACEMENT` | 45 min |

---

## Project Structure

```
src/
├── main.ts                    # Entry point, Swagger setup
├── app.module.ts              # Root module
├── prisma/                    # PrismaService (DB connection)
├── appointments/              # Core booking module
│   ├── appointments.controller.ts
│   ├── appointments.service.ts
│   ├── appointments.service.spec.ts  ← unit tests
│   ├── appointments.module.ts
│   └── dto/
│       └── create-appointment.dto.ts
├── availability/              # Shared availability logic
│   ├── availability.service.ts
│   ├── availability.service.spec.ts  ← unit tests
│   └── availability.module.ts
├── service-bays/
├── technicians/
├── customers/
└── vehicles/
prisma/
├── schema.prisma              # DB schema
└── seed.ts                    # Test data seed
```

---

## AI Collaboration Narrative

### My Role vs. the AI's Role

I treated the AI as a senior developer who executes well but needs architectural direction. My job was to design the system, define constraints, and review everything critically. The AI's job was to accelerate implementation of decisions I had already made.

Every significant design decision in this project was reached independently before AI wrote a single line of code. The five most interesting ones are below.

### Five Architectural Debates

**1. Concurrency strategy — I set the direction before asking AI anything.**

I identified double-booking under concurrent load as the hardest problem in this scenario before writing a single line of code. I researched three patterns independently — optimistic locking with retries, pessimistic locking with `SELECT FOR UPDATE`, and application-level mutexes with Redis — and concluded that `SELECT FOR UPDATE SKIP LOCKED` was the correct fit: non-blocking, no external dependency, no retry storm. I then asked Claude to implement that specific pattern. It did not choose the pattern; it implemented the pattern I had already validated against the PostgreSQL 16 documentation.

**2. State machine — I rejected the naive if-else approach.**

When I asked Claude to implement appointment status transitions, it generated nested `if-else` blocks checking current status inline. I rejected this immediately: adding a future status (e.g. `RESCHEDULED`) would require modifying multiple conditional branches — a maintenance hazard. I directed it to use an `ALLOWED_TRANSITIONS` lookup table — a declarative map of `currentStatus → allowedNextStatuses[]`. The validation logic becomes a two-line map lookup. Adding a new status requires one new map entry, not a code change.

**3. Next-available slot — I caught an O(n) query problem and redesigned the algorithm.**

When I asked Claude to implement `GET /slots/next-available`, its first proposal iterated through 30-minute windows sequentially and ran one DB query per window. For a 7-day search at 30-minute resolution, that is 336 DB queries per API call — unacceptable. I rejected this and designed a 3-query algorithm: (1) fetch all future appointments for the dealership in a single query, (2) fetch all bays and qualified technicians, (3) build in-memory occupation maps and evaluate candidate times without touching the database again. The candidate times are derived from appointment end-times — the only moments when availability can change — so the search is both exhaustive and efficient. Total cost: 3 queries regardless of search horizon.

**4. Domain events — I moved the emit point from controller to service.**

Claude's initial implementation placed `eventEmitter.emit()` calls in the controller. I moved them to the service layer. The reasoning: a controller's responsibility is to translate HTTP requests into service calls and return responses. It has no business knowing whether creating an appointment should trigger downstream side effects. The service layer owns the business outcome — it is the correct place to announce that a business event has occurred.

**5. Data model — I rejected the join table for technician specializations.**

Claude's first schema draft used a join table (`technician_specializations`) linking technicians to service types. I rejected this: a join table adds a query-time join for a field that never needs independent querying, filtering, or metadata. I directed Claude to use a PostgreSQL `text[]` array instead, enabling `serviceType = ANY(specializations)` directly in the availability query with no join. I own this trade-off: if specialization metadata (pay rates, certification expiry) were ever needed, a migration would be required.

### Bugs I Caught in AI Output

| Issue | How I Found It |
|---|---|
| `AvailabilityService` spec had zero tests for `findAvailableBay` and `findAvailableTechnician` — the two critical methods — and mocks were set up on the wrong object | Manual review of generated spec file |
| `app.module.ts` imported five modules that did not exist — build would fail silently | Audited imports against actual file tree |
| `HealthController` returned `500` on DB failure instead of `503` | Deliberate e2e test asserting the correct status code |
| State machine implemented as if-else chains | Code review before accepting |
| Next-available slot algorithm ran O(n) DB queries | Performance analysis before accepting |

### Key Decisions That Were Mine Alone

| Decision | My Reasoning |
|---|---|
| `SELECT FOR UPDATE SKIP LOCKED` | Non-blocking, no retry loops, no external dependency |
| `text[]` over join table | No join needed; `ANY()` is sufficient for the query |
| State machine as a transition table | Extensible without touching validation logic |
| 3-query algorithm for next-available slot | O(1) queries vs O(n) — scales with load |
| Domain events in service layer, not controller | Layer responsibility — controllers handle HTTP, not business events |
| Transaction boundary in service layer | Atomicity is a business logic concern, not an HTTP concern |
| `dealershipId` denormalized on `Appointment` | Avoids join on the most common query pattern |

### Quality Assurance

All AI-generated code was reviewed line-by-line before being accepted. The test suite (15 unit + 18 e2e = 33 total) validates business behavior at both the service and HTTP layers. Tests were reviewed to confirm they assert outcomes, not implementation details.

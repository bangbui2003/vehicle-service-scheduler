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

### Appointments

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/appointments` | Book an appointment (supports `X-Idempotency-Key` header) |
| `GET` | `/appointments` | List with filters (customerId, dealershipId, date) + pagination |
| `GET` | `/appointments/:id` | Get single appointment |
| `PATCH` | `/appointments/:id/status` | Transition status via state machine |
| `DELETE` | `/appointments/:id` | Cancel appointment |

### Slot Discovery

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/slots/next-available` | Find next available slot (3-query algorithm, up to 7 days ahead) |

### Management

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST/GET/DELETE` | `/customers` | Customer CRUD |
| `POST/GET/DELETE` | `/vehicles` | Vehicle CRUD (filter by customerId) |
| `POST/GET/DELETE` | `/service-bays` | ServiceBay CRUD (filter by dealershipId) |
| `POST/GET/DELETE` | `/technicians` | Technician CRUD (filter by dealershipId) |

### Operations

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check — returns 200 or 503 |
| `GET` | `/metrics` | Prometheus metrics (booking outcomes, Node.js runtime) |

Full interactive docs: `http://localhost:3000/api/docs`

### Example: Book an Appointment

```bash
curl -X POST http://localhost:3000/appointments \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: <uuid>" \
  -d '{
    "customerId": "<uuid>",
    "vehicleId": "<uuid>",
    "dealershipId": "<uuid>",
    "serviceType": "OIL_CHANGE",
    "desiredStartTime": "2026-07-01T09:00:00.000Z"
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

### Headers

- `X-Idempotency-Key`: optional but recommended on `POST /appointments` to make create requests idempotent across retries. The service honours idempotency for identical payloads within a short TTL (see production notes).

### Rate limiting

- The API enforces rate limiting to protect against abusive clients. When a client exceeds the allowed request rate the server returns `429 Too Many Requests`. In production this is implemented via `@nestjs/throttler` with sensible per-route defaults; clients should respect `Retry-After` when present.

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
| `OIL_CHANGE` | 45 min |
| `TIRE_ROTATION` | 45 min |
| `BRAKE_REPAIR` | 120 min |
| `FULL_SERVICE` | 180 min |
| `INSPECTION` | 30 min |
| `BATTERY_REPLACEMENT` | 45 min |
| `TIRE_REPLACEMENT` | 90 min |

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

### High-Level Strategy: Design First, Delegate Second

I treated the AI as a fast-typing junior developer who needs strict architectural boundaries. My strategy was to make every core architectural decision independently before scaffolding, and then use AI to accelerate the boilerplate implementation. I explicitly constrained the AI from over-engineering (e.g., forbidding Redis or external message brokers) to ensure the system remained atomic and PostgreSQL-native.

### Process for Refining AI Output

When the AI generated naive solutions, I actively overruled them to enforce production-grade patterns:
1. **Concurrency & Idempotency:** The AI's reflex for preventing double-booking and handling idempotency was to add a Redis cache. I rejected this and forced a pure PostgreSQL approach using `SELECT FOR UPDATE SKIP LOCKED` and an atomic `idempotency_records` table.
2. **Algorithmic Complexity:** For slot discovery (`GET /slots/next-available`), the AI wrote a loop executing a database query per 30-minute window (O(n)). I scrapped this and designed a 3-query in-memory algorithm (O(1)).
3. **Event-Driven Architecture:** The AI placed `EventEmitter` calls in the controllers. I moved them to the service layer and subsequently upgraded the pattern to a true **Transactional Outbox**, ensuring domain events are persisted atomically alongside the booking.
4. **Pagination:** The AI defaulted to offset-based pagination. I directed it to implement **Cursor-based Pagination** for O(1) seek performance at scale.
5. **State Machine:** The AI used nested `if-else` blocks for status updates. I forced a refactor into a declarative `ALLOWED_TRANSITIONS` map to eliminate fragile branching logic.

### Verification and Quality Assurance

I ensured the final quality of the code through a strict verification process:
- **Line-by-Line Review:** Every AI-generated file was audited. I caught and fixed several bugs, including missing test coverage on critical locking methods and incorrect HTTP status codes (returning 500 instead of 503 on DB health failure).
- **Concurrency Testing:** To mathematically prove the AI's implementation of my `SKIP LOCKED` strategy, I designed a `Promise.all()` E2E test that fires 5 simultaneous booking requests to the exact same slot, asserting that exactly 1 succeeds (201) and 4 fail safely (409 Conflict).
- **Comprehensive Test Suite:** The final codebase includes 24 tests (Unit & E2E) that validate core business behavior, ensuring that the AI's code accurately models the domain constraints.

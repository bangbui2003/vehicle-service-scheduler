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

My approach was to **design first, then direct AI to implement**. Every architectural decision in this project was mine — I used Claude (Anthropic) as an accelerator for implementation, not as the decision-maker.

### How I Directed the AI

**1. I identified the core problem before involving AI.**
The central challenge in this scenario is preventing double-booking under concurrent load. I recognised this as a classic read-then-write race condition before writing a single line of code. I researched the available patterns — optimistic locking, pessimistic locking, and application-level mutexes — and independently concluded that `SELECT FOR UPDATE SKIP LOCKED` inside a database transaction was the appropriate fit for this read-then-write pattern with low contention.

I then asked Claude to implement this specific pattern rather than asking it to "solve double-booking" and accepting whatever it suggested.

**2. I set constraints before asking for output.**
Before any scaffolding, I defined the module boundaries, the transaction ownership (the service layer, not the controller), and the error contract (409 for resource conflicts, 404 for not found). Claude generated code within a design I had already validated.

**3. I caught and corrected AI mistakes.**

During review I identified several issues in Claude's initial output:

- The `AvailabilityService` spec did not test `findAvailableBay` or `findAvailableTechnician` — the two most critical methods. I directed Claude to add these tests with correct mock setup on the transaction client, not on the PrismaService directly.
- The `app.module.ts` imported five modules that did not yet exist, which would have broken the build silently. I caught this by cross-referencing the import list against the actual file tree.
- The `HealthController` did not wrap database errors in `HealthCheckError`, meaning the `/health` endpoint returned `500` instead of `503` on DB failure. I identified this via the failing e2e test and directed the fix.

**4. I validated every architectural claim against documentation.**

- Verified PostgreSQL `SKIP LOCKED` semantics against the PostgreSQL 16 docs to confirm it is non-blocking and does not deadlock.
- Verified Prisma `$transaction` isolation level and confirmed that row locks are held until commit.
- Verified the time overlap condition (`start < req_end AND end > req_start`) against five boundary cases by hand before accepting it.

### Key Decisions That Were Mine Alone

| Decision | My Reasoning |
|---|---|
| `SELECT FOR UPDATE SKIP LOCKED` over optimistic locking | Avoids retry storms; non-blocking under contention |
| `text[]` for technician specializations instead of a join table | No need for metadata on specializations; `ANY()` in SQL is sufficient |
| `DELETE /appointments/:id` for cancel, not `PATCH` | Semantically clearer — the client is removing a booking, not updating a field |
| `dealershipId` denormalized on `Appointment` | Avoids join on the most common query (list by dealership) |
| Transaction boundary in the service layer | Keeps controllers thin; ensures atomicity is owned by business logic |
| Separate `AvailabilityService` module | Single-responsibility; reusable if other booking flows are added |

### Quality Assurance

All AI-generated code was reviewed line-by-line before being accepted. The unit test suite (15 tests) and e2e test suite (17 tests) were written to validate behavior at the HTTP layer and service layer respectively. Tests were reviewed to ensure they tested outcomes, not internal implementation details.

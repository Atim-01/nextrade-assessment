# Nextrade Assessment — Crypto-to-Fiat Backend MVP

A production-ready backend service handling the core money movement lifecycle on Base Sepolia (Ethereum L2).

## Architecture Overview

```
Client → REST API (Fastify + TypeScript)
              ↓
        Service Layer
   ┌─────────┬──────────┬────────┐
 Deposit   Payout    Sweep
   └─────────┴──────────┴────────┘
              ↓
        PostgreSQL (Prisma)
        [users, wallets, balances, transactions]
              ↓
        Blockchain Layer (ethers.js v6)
        [HD Wallet derivation, tx broadcast, block scanning]
              ↓
        Job Queue (BullMQ + Redis)
        [deposit monitor every 30s, sweep every 5min]
```

## Key Design Decisions

### 1. HD Wallet Architecture
Every user gets a unique deposit address derived from a single BIP-44 master seed (`m/44'/60'/0'/0/{index}`). Private keys are derived on demand, used to sign, then discarded — they are never stored in the database. If the database is compromised, an attacker gets addresses only, which are useless without the seed phrase.

### 2. Internal Ledger as Source of Truth
The database balance is the source of truth — not the blockchain. The blockchain is the confirmation layer. This means the system can respond instantly to user balance queries without making RPC calls, and can reconcile against chain state asynchronously.

### 3. Balance Locking for Payouts
Before broadcasting any payout transaction, the requested amount is moved from `available` to `locked` in the database. This prevents double-spend in concurrent payout requests. On confirmation, locked balance is released. On failure, it is restored to available.

### 4. Idempotent Deposit Detection
Every deposit is recorded by transaction hash. Before crediting any deposit, the system checks if that tx hash already exists in the database. This means the deposit monitor can safely re-scan overlapping blocks without double-crediting.

### 5. Sweep Strategy
Rather than holding funds idle in hundreds of user deposit addresses, a background job sweeps balances above a configurable threshold to a single treasury wallet every 5 minutes. Gas cost is estimated before each sweep and deducted from the transfer amount so the transaction never fails due to insufficient funds.

### 6. Failure Handling
- Deposit monitor: catches per-wallet errors, continues to next wallet
- Payout broadcast failure: balance immediately restored, transaction marked FAILED
- Payout confirmation failure: balance restored, transaction marked FAILED
- Sweep failure: logged per wallet, does not stop other wallets from being swept

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js + TypeScript | Type safety across the entire codebase |
| Framework | Fastify | Schema-first, fast, production-grade |
| ORM | Prisma + PostgreSQL | Type-safe queries, atomic transactions |
| Queue | BullMQ + Redis | Reliable job scheduling with retry support |
| Blockchain | ethers.js v6 | Best-in-class TypeScript support for EVM |
| Chain | Base Sepolia (testnet) | EVM-compatible, fast finality, Coinbase-backed |

## Trade-offs & Known Limitations

- **Gas estimation**: Sweep uses a fixed 21000 gas limit (standard ETH transfer). ERC-20 token support would require dynamic gas estimation per token contract.
- **No webhook/notification system**: Users currently have to poll the balance endpoint. Production would push deposit confirmations via webhooks or WebSocket.
- **Testnet RPC reliability**: Public Base Sepolia RPC endpoints are rate-limited and occasionally unavailable. A production deployment would use a dedicated RPC provider (e.g. Alchemy, Infura) with fallback nodes configured.

## Implementation Notes

- **Decimal precision**: All balance arithmetic uses `decimal.js` to eliminate floating point errors at high crypto precision. Amounts are stored as strings in the database and never handled as raw JavaScript floats.
- **Block persistence**: The deposit monitor persists the last scanned block in the database via the `ScanState` model. On restart, it resumes from that point rather than a fixed window, preventing missed deposits during downtime.

## How to Run

### Prerequisites
- Node.js v18+
- PostgreSQL
- Redis

### Setup

```bash
git clone https://github.com/Atim-01/nextrade-assessment.git
cd nextrade-assessment
npm install
```

Create a `.env` file:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/nextrade"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secret-key-min-16-chars"
MNEMONIC="your twelve word seed phrase here"
SWEEP_THRESHOLD="0.001"
TREASURY_ADDRESS="0xYourTreasuryAddress"
CHAIN_RPC="https://sepolia.base.org"
CHAIN_ID="84532"
PORT=3000
```

```bash
npx prisma migrate dev
npm run dev
```

Server starts on `http://localhost:3000`

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/users/register` | None | Register and get deposit address |
| POST | `/api/users/login` | None | Login and get JWT |

### Balances
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users/balance` | JWT | Get available and locked balance |

### Deposits
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/deposits/address` | JWT | Get your deposit address |
| GET | `/api/deposits/transactions` | JWT | Deposit history |

### Payouts
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/payouts` | JWT | Request a payout |
| GET | `/api/payouts/transactions` | JWT | Full transaction history |

### System
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check |
# eVote - Blockchain-based Electronic Voting System for Indian Elections

eVote is a secure, transparent, and scalable electronic voting system designed for Indian elections. It leverages blockchain technology to ensure that every vote is immutable, verifiable, and anonymous.

## 🚀 Architecture

- **Blockchain Layer**: Polygon (Amoy Testnet) using Solidity smart contracts.
- **Backend API**: Node.js, TypeScript, Express, and MongoDB.
- **Mobile Application**: React Native with Expo (iOS & Android).

## 🛠️ Components

### 1. Blockchain (`/contracts`)
- `VoterRegistry.sol`: Manages eligible voters and prevents double-voting using cryptographic nullifiers.
- `Election.sol`: Handles election creation, candidate registration, and vote casting.
- **Tooling**: Hardhat for compilation, testing, and deployment.
- Deploy one `Election` contract instance per supported blockchain network. The backend election record stores the network `chainId`, `blockchainNetwork`, `contractAddress`, and the on-chain `blockchainId`, so overlapping elections can route to different deployments.

### 2. Backend API (`/backend`)
- **Identity Verification**: Verifies Government IDs (EPIC/Aadhaar) through the configured government API connector.
- **Voting Tokens**: Signs nullifiers to authorize voters on the blockchain without revealing their identity.
- **Election Management**: REST API to manage and retrieve active elections and candidates.

### 3. Mobile Application (`/mobile`)
- **Biometric Security**: Uses FaceID/Fingerprint for voting confirmation.
- **User Flow**: Identity Verification $\rightarrow$ Election Dashboard $\rightarrow$ Candidate Selection $\rightarrow$ Secure Voting.
- **Blockchain Integration**: Interfaces with the backend and blockchain to cast votes.

### 4. Client applications (`/clients`)
- `/clients/web`: Vite React dashboard for voters, election officers, and administrators.
- `/clients/mobile`: Expo React Native client with secure session storage and biometric confirmation.
- Multiple elections may be active at the same time. Each election carries independent dates, constituency, network, chain ID, contract address, and on-chain election ID.

## 📦 Setup & Installation

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Hardhat
- Expo Go (on mobile device)

### 1. Backend Setup
```bash
cd backend
npm install
# Configure .env with MONGODB_URI, JWT_SECRET, PRIVATE_KEY, and the government verification API settings from backend/.env.example
npm run dev
```

### 2. Blockchain Setup
```bash
cd contracts
npm install
# Configure ../backend/.env with POLYGON_AMOY_RPC and PRIVATE_KEY
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network amoy
```

### 3. Mobile Setup
```bash
cd mobile
npm install
npx expo start
```

## 🛡️ Security Features
- **Nullifiers**: Decouples the voter's identity from the vote cast.
- **Digital Signatures**: Ensures only backend-authorized voters can interact with the smart contract.
- **Biometrics**: Adds a layer of physical security to the mobile voting process.
- **Immutability**: Every vote is stored on the Polygon ledger, providing a permanent audit trail.

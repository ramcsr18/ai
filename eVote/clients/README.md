# eVote clients

This folder contains the new role-aware client applications for the eVote backend.

## Web

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Set `VITE_API_URL` when the backend is not at `http://localhost:5001/api`.

## Mobile

```bash
cd mobile
npm install
npx expo start
```

The default Android emulator API URL is `http://10.0.2.2:5001/api`. Set `EXPO_PUBLIC_API_URL` for a physical device or another backend host.

Both clients support identity verification, role-aware dashboards, active elections, candidate lists, secure session storage, voter profiles, voting-token requests, and the existing admin/officer record operations. The current backend does not expose a final vote-casting route, so token requests stop at the backend signing step and clearly identify the remaining blockchain submission as a simulation.

Roles are read from the JWT and currently map to:

- `VOTER`: elections, candidates, voting-token request, profile
- `ELECTION_OFFICER`: elections, polling stations, booths, election creation
- `ADMIN`: all officer operations plus constituencies and parties

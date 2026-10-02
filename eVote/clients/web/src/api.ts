import axios from 'axios';

export type Role = 'VOTER' | 'ELECTION_OFFICER' | 'ADMIN';
export type Session = { token: string; user: { id: string; isVerified: boolean; role: Role } };

export type Election = {
  _id: string;
  name: string;
  startTime?: string;
  endTime?: string;
  constituencyId?: string;
  blockchainId?: string;
  chainId?: number;
  blockchainNetwork?: string;
  contractAddress?: string;
};

export type Candidate = { _id: string; name: string; party?: string; blockchainCandidateId: number };

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api' });

export function storedSession(): Session | null {
  const value = localStorage.getItem('evote_session');
  return value ? JSON.parse(value) : null;
}

api.interceptors.request.use((config) => {
  const session = storedSession();
  if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

export async function verifyIdentity(govtId: string, name: string) {
  const { data } = await api.post('/auth/verify-id', { govtId, name });
  const session: Session = { token: data.token, user: { ...data.voter, role: decodeRole(data.token) } };
  localStorage.setItem('evote_session', JSON.stringify(session));
  return session;
}

function decodeRole(token: string): Role {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'VOTER';
  } catch {
    return 'VOTER';
  }
}

export const getElections = () => api.get<Election[]>('/elections').then((response) => response.data);
export const getCandidates = (electionId: string) => api.get<Candidate[]>(`/elections/${electionId}/candidates`).then((response) => response.data);
export const getProfile = () => api.get('/admin/voters/profile').then((response) => response.data);
export const getCollection = (name: string) => api.get(`/admin/${name}`).then((response) => response.data);
export const createResource = (name: string, payload: unknown) => api.post(`/admin/${name}`, payload).then((response) => response.data);
export const createElection = (payload: unknown) => api.post('/elections', payload).then((response) => response.data);
export const getVotingToken = (electionId: string, nullifier: string) => api.post('/auth/get-voting-token', { electionId, nullifier }).then((response) => response.data);
export default api;

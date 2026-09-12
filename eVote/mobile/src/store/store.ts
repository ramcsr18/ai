import { create } from 'zustand';

interface AuthState {
    token: string | null;
    user: any | null;
    setAuth: (token: string, user: any) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    token: null,
    user: null,
    setAuth: (token, user) => set({ token, user }),
    clearAuth: () => set({ token: null, user: null }),
}));

interface VoteState {
    selectedElectionId: string | null;
    selectedCandidateId: number | null;
    setSelectedElection: (id: string) => void;
    setSelectedCandidate: (id: number) => void;
    resetVote: () => void;
}

export const useVoteStore = create<VoteState>((set) => ({
    selectedElectionId: null,
    selectedCandidateId: null,
    setSelectedElection: (id) => set({ selectedElectionId: id }),
    setSelectedCandidate: (id) => set({ selectedCandidateId: id }),
    resetVote: () => set({ selectedElectionId: null, selectedCandidateId: null }),
}));

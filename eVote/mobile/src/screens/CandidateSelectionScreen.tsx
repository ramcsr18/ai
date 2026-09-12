import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import { useVoteStore } from '../store/store';

const CandidateSelectionScreen = ({ navigation }: any) => {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const selectedElectionId = useVoteStore((state) => state.selectedElectionId);
    const setSelectedCandidate = useVoteStore((state) => state.setSelectedCandidate);

    useEffect(() => {
        const fetchCandidates = async () => {
            try {
                const response = await api.get(`/elections/${selectedElectionId}/candidates`);
                setCandidates(response.data);
            } catch (error: any) {
                Alert.alert('Error', 'Failed to load candidates');
            } finally {
                setLoading(false);
            }
        };
        if (selectedElectionId) fetchCandidates();
    }, [selectedElectionId]);

    const handleSelectCandidate = (id: number) => {
        setSelectedCandidate(id);
        navigation.navigate('Confirmation');
    };

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator size="large" color="#3498db" /></View>;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Select Your Candidate</Text>
            <FlatList
                data={candidates}
                keyExtractor={(item: any) => item._id}
                renderItem={({ item }: any) => (
                    <TouchableOpacity style={styles.candidateCard} onPress={() => handleSelectCandidate(item.blockchainCandidateId)}>
                        <View style={styles.candidateInfo}>
                            <Text style={styles.candidateName}>{item.name}</Text>
                            <Text style={styles.candidateParty}>{item.party}</Text>
                        </View>
                        <TouchableOpacity style={styles.selectButton}>
                            <Text style={styles.selectButtonText}>Select</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No candidates found for this election.</Text>}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#2c3e50',
        marginTop: 40,
    },
    candidateCard: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 2,
    },
    candidateInfo: {
        flex: 1,
    },
    candidateName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#34495e',
    },
    candidateParty: {
        fontSize: 14,
        color: '#7f8c8d',
    },
    selectButton: {
        backgroundColor: '#3498db',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 8,
    },
    selectButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 50,
        color: '#7f8c8d',
    },
});

export default CandidateSelectionScreen;

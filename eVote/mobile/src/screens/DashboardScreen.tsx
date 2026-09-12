import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import { useVoteStore } from '../store/store';

const DashboardScreen = ({ navigation }: any) => {
    const [elections, setElections] = useState([]);
    const [loading, setLoading] = useState(true);
    const setSelectedElection = useVoteStore((state) => state.setSelectedElection);

    useEffect(() => {
        const fetchElections = async () => {
            try {
                const response = await api.get('/elections');
                setElections(response.data);
            } catch (error: any) {
                Alert.alert('Error', 'Failed to load active elections');
            } finally {
                setLoading(false);
            }
        };
        fetchElections();
    }, []);

    const handleSelectElection = (id: string) => {
        setSelectedElection(id);
        navigation.navigate('CandidateSelection');
    };

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator size="large" color="#3498db" /></View>;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Active Elections</Text>
            <FlatList
                data={elections}
                keyExtractor={(item: any) => item._id}
                renderItem={({ item }: any) => (
                    <TouchableOpacity style={styles.electionCard} onPress={() => handleSelectElection(item._id)}>
                        <Text style={styles.electionName}>{item.name}</Text>
                        <Text style={styles.electionStatus}>Active</Text>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No active elections at the moment.</Text>}
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
    electionCard: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    electionName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#34495e',
    },
    electionStatus: {
        fontSize: 14,
        color: '#27ae60',
        fontWeight: 'bold',
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 50,
        color: '#7f8c8d',
    },
});

export default DashboardScreen;

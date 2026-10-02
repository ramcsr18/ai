import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import api from '../api/client';
import { useVoteStore, useAuthStore } from '../store/store';

const DashboardScreen = ({ navigation }: any) => {
    const [elections, setElections] = useState([]);
    const [loading, setLoading] = useState(true);
    const user = useAuthStore((state) => state.user);
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

    const renderAdminMenu = () => (
        <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Administrator Tools</Text>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('ConstituencyManagement')}>
                <Text style={styles.menuButtonText}>Manage Constituencies</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('StationManagement')}>
                <Text style={styles.menuButtonText}>Manage Polling Stations</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('BoothManagement')}>
                <Text style={styles.menuButtonText}>Manage Booths</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('PartyManagement')}>
                <Text style={styles.menuButtonText}>Manage Political Parties</Text>
            </TouchableOpacity>
        </View>
    );

    const renderOfficerMenu = () => (
        <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Officer Tools</Text>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('StationManagement')}>
                <Text style={styles.menuButtonText}>Manage Polling Stations</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('BoothManagement')}>
                <Text style={styles.menuButtonText}>Manage Booths</Text>
            </TouchableOpacity>
        </View>
    );

    const renderVoterMenu = () => (
        <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Voter Tools</Text>
            <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('VoterProfile')}>
                <Text style={styles.menuButtonText}>My Registration Details</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>eVote Dashboard</Text>

            {user?.role === 'ADMIN' && renderAdminMenu()}
            {user?.role === 'ELECTION_OFFICER' && renderOfficerMenu()}
            {user?.role === 'VOTER' && renderVoterMenu()}

            <Text style={styles.sectionTitle}>Active Elections</Text>
            <FlatList
                data={elections}
                keyExtractor={(item: any) => item._id}
                scrollEnabled={false}
                renderItem={({ item }: any) => (
                    <TouchableOpacity style={styles.electionCard} onPress={() => handleSelectElection(item._id)}>
                        <Text style={styles.electionName}>{item.name}</Text>
                        <Text style={styles.electionStatus}>Active</Text>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No active elections at the moment.</Text>}
            />
        </ScrollView>
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
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#2c3e50',
        marginTop: 40,
        textAlign: 'center',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginVertical: 20,
        color: '#34495e',
    },
    menuContainer: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        marginBottom: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#2c3e50',
        textAlign: 'center',
    },
    menuButton: {
        backgroundColor: '#3498db',
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    menuButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
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
        marginTop: 20,
        color: '#7f8c8d',
    },
});

export default DashboardScreen;

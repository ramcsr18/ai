import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'http://localhost:5000/api/admin';

export const VoterProfileScreen = () => {
    const [profile, setProfile] = useState(null);

    const fetchProfile = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await axios.get(`${API_BASE}/voters/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProfile(res.data);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchProfile(); }, []);

    if (!profile) return <View style={styles.container}><Text>Loading profile...</Text></View>;

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>My Voter Profile</Text>
            <View style={styles.section}>
                <Text style={styles.label}>National ID:</Text>
                <Text style={styles.value}>{profile.nationalId ? '****' + profile.nationalId.slice(-4) : 'Not assigned'}</Text>
            </View>
            <View style={styles.section}>
                <Text style={styles.label}>Date of Birth:</Text>
                <Text style={styles.value}>{new Date(profile.dob).toLocaleDateString()}</Text>
            </View>
            <View style={styles.section}>
                <Text style={styles.label}>Constituency:</Text>
                <Text style={styles.value}>{profile.constituencyId?.name || 'Not assigned'}</Text>
            </View>
            <View style={styles.section}>
                <Text style={styles.label}>Polling Station:</Text>
                <Text style={styles.value}>{profile.stationId?.name || 'Not assigned'}</Text>
                <Text style={styles.subValue}>{profile.stationId?.address || ''}</Text>
            </View>
            <View style={styles.section}>
                <Text style={styles.label}>Booth Number:</Text>
                <Text style={styles.value}>{profile.boothId?.boothNumber || 'Not assigned'}</Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
    section: { marginBottom: 20, padding: 15, backgroundColor: '#f9f9f9', borderRadius: 10 },
    label: { fontSize: 14, color: '#666', marginBottom: 5 },
    value: { fontSize: 18, fontWeight: '600' },
    subValue: { fontSize: 14, color: '#888' }
});

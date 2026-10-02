import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/admin';

export const BoothManagementScreen = () => {
    const [boothNumber, setBoothNumber] = useState('');
    const [stationId, setStationId] = useState('');
    const [capacity, setCapacity] = useState('');
    const [booths, setBooths] = useState([]);

    const fetchBooths = async () => {
        try {
            const res = await axios.get(`${API_BASE}/booths`);
            setBooths(res.data);
        } catch (e) { console.error(e); }
    };

    const handleCreate = async () => {
        try {
            await axios.post(`${API_BASE}/booths`, {
                boothNumber: parseInt(boothNumber),
                stationId,
                capacity: parseInt(capacity)
            });
            setBoothNumber(''); setStationId(''); setCapacity('');
            fetchBooths();
        } catch (e) { console.error(e); }
    };

    React.useEffect(() => { fetchBooths(); }, []);

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Manage Booths</Text>
            <TextInput placeholder="Booth Number" value={boothNumber} onChangeText={setBoothNumber} keyboardType="numeric" style={styles.input} />
            <TextInput placeholder="Station ID" value={stationId} onChangeText={setStationId} style={styles.input} />
            <TextInput placeholder="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="numeric" style={styles.input} />
            <Button title="Create Booth" onPress={handleCreate} />
            <FlatList
                data={booths}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => <Text style={styles.item}>Booth #{item.boothNumber} - Capacity: {item.capacity}</Text>}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5 },
    item: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }
});

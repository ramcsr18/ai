import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/admin';

export const StationManagementScreen = () => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [constituencyId, setConstituencyId] = useState('');
    const [stations, setStations] = useState([]);

    const fetchStations = async () => {
        try {
            const res = await axios.get(`${API_BASE}/polling-stations`);
            setStations(res.data);
        } catch (e) { console.error(e); }
    };

    const handleCreate = async () => {
        try {
            await axios.post(`${API_BASE}/polling-stations`, { name, address, constituencyId });
            setName(''); setAddress(''); setConstituencyId('');
            fetchStations();
        } catch (e) { console.error(e); }
    };

    React.useEffect(() => { fetchStations(); }, []);

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Manage Polling Stations</Text>
            <TextInput placeholder="Name" value={name} onChangeText={setName} style={styles.input} />
            <TextInput placeholder="Address" value={address} onChangeText={setAddress} style={styles.input} />
            <TextInput placeholder="Constituency ID" value={constituencyId} onChangeText={setConstituencyId} style={styles.input} />
            <Button title="Create Station" onPress={handleCreate} />
            <FlatList
                data={stations}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => <Text style={styles.item}>{item.name} - {item.address}</Text>}
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

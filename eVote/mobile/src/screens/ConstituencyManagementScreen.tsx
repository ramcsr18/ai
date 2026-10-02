import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/admin';

export const ConstituencyManagementScreen = ({ navigation }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [region, setRegion] = useState('');
    const [constituencies, setConstituencies] = useState([]);

    const fetchConstituencies = async () => {
        try {
            const res = await axios.get(`${API_BASE}/constituencies`);
            setConstituencies(res.data);
        } catch (e) { console.error(e); }
    };

    const handleCreate = async () => {
        try {
            await axios.post(`${API_BASE}/constituencies`, { name, code, region });
            setName(''); setCode(''); setRegion('');
            fetchConstituencies();
        } catch (e) { console.error(e); }
    };

    React.useEffect(() => { fetchConstituencies(); }, []);

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Manage Constituencies</Text>
            <TextInput placeholder="Name" value={name} onChangeText={setName} style={styles.input} />
            <TextInput placeholder="Code" value={code} onChangeText={setCode} style={styles.input} />
            <TextInput placeholder="Region" value={region} onChangeText={setRegion} style={styles.input} />
            <Button title="Create Constituency" onPress={handleCreate} />
            <FlatList
                data={constituencies}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => <Text style={styles.item}>{item.name} ({item.code}) - {item.region}</Text>}
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

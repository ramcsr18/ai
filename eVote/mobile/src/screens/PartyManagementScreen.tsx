import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api/admin';

export const PartyManagementScreen = () => {
    const [name, setName] = useState('');
    const [abbreviation, setAbbreviation] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [parties, setParties] = useState([]);

    const fetchParties = async () => {
        try {
            const res = await axios.get(`${API_BASE}/parties`);
            setParties(res.data);
        } catch (e) { console.error(e); }
    };

    const handleCreate = async () => {
        try {
            await axios.post(`${API_BASE}/parties`, { name, abbreviation, logoUrl });
            setName(''); setAbbreviation(''); setLogoUrl('');
            fetchParties();
        } catch (e) { console.error(e); }
    };

    React.useEffect(() => { fetchParties(); }, []);

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Manage Political Parties</Text>
            <TextInput placeholder="Party Name" value={name} onChangeText={setName} style={styles.input} />
            <TextInput placeholder="Abbreviation" value={abbreviation} onChangeText={setAbbreviation} style={styles.input} />
            <TextInput placeholder="Logo URL" value={logoUrl} onChangeText={setLogoUrl} style={styles.input} />
            <Button title="Create Party" onPress={handleCreate} />
            <FlatList
                data={parties}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => <Text style={styles.item}>{item.name} ({item.abbreviation})</Text>}
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

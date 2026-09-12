import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import api from '../api/client';
import { useAuthStore } from '../store/store';

const AuthScreen = ({ navigation }: any) => {
    const [govtId, setGovtId] = useState('');
    const [name, setName] = useState('');
    const setAuth = useAuthStore((state) => state.setAuth);

    const handleVerify = async () => {
        try {
            const response = await api.post('/auth/verify-id', { govtId, name });
            const { token, voter } = response.data;
            setAuth(token, voter);
            navigation.navigate('Dashboard');
        } catch (error: any) {
            Alert.alert('Verification Failed', error.response?.data?.error || 'An error occurred');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>eVote India</Text>
            <Text style={styles.subtitle}>Secure Blockchain Voting</Text>

            <TextInput
                style={styles.input}
                placeholder="Enter Govt ID (EPIC/Aadhaar)"
                value={govtId}
                onChangeText={setGovtId}
            />
            <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
            />

            <TouchableOpacity style={styles.button} onPress={handleVerify}>
                <Text style={styles.buttonText}>Verify Identity</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#2c3e50',
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        color: '#7f8c8d',
        marginBottom: 40,
    },
    input: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    button: {
        backgroundColor: '#3498db',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default AuthScreen;

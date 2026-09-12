import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import api from '../api/client';
import { useAuthStore, useVoteStore } from '../store/store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ethers } from 'ethers';

const ConfirmationScreen = ({ navigation }: any) => {
    const [isVoting, setIsVoting] = useState(false);
    const { token } = useAuthStore();
    const { selectedElectionId, selectedCandidateId, resetVote } = useVoteStore();

    const handleCastVote = async () => {
        try {
            // 1. Biometric Authentication
            const hasHardwareSupport = await LocalAuthentication.hasHardwareAsync();
            if (hasHardwareSupport) {
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Authenticate to cast your vote',
                    fallbackLabel: 'Use Passcode',
                });
                if (!result.success) {
                    Alert.alert('Authentication Failed', 'Biometric verification is required to vote.');
                    return;
                }
            }

            setIsVoting(true);

            // 2. Generate Nullifier (Simplified for simulation)
            // In production, this would be a cryptographic derivation from the user's secret key
            const nullifier = ethers.utils.id('voter_secret_simulation');

            // 3. Get Voting Token from Backend
            const tokenResponse = await api.post('/auth/get-voting-token', { nullifier }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const { signature } = tokenResponse.data;

            // 4. Cast Vote on Blockchain
            // In a real app, we use the user's private key from SecureStore to sign the transaction
            // and call the smart contract castVote function.

            // Simulation of blockchain transaction
            await new Promise(resolve => setTimeout(resolve, 2000));
            const txHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

            Alert.alert('Vote Cast Successfully!', `Your vote has been recorded on the blockchain.\n\nTX Hash: ${txHash.substring(0, 20)}...`);

            resetVote();
            navigation.navigate('Dashboard');
        } catch (error: any) {
            Alert.alert('Voting Failed', error.response?.data?.error || 'An error occurred while casting your vote');
        } finally {
            setIsVoting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Confirm Your Vote</Text>

            <View style={styles.summaryCard}>
                <Text style={styles.label}>Election:</Text>
                <Text style={styles.value}>{selectedElectionId}</Text>

                <Text style={styles.label}>Candidate ID:</Text>
                <Text style={styles.value}>{selectedCandidateId}</Text>
            </View>

            <Text style={styles.warning}>
                Warning: Once cast, your vote cannot be changed or deleted.
            </Text>

            <TouchableOpacity
                style={[styles.button, isVoting && styles.buttonDisabled]}
                onPress={handleCastVote}
                disabled={isVoting}
            >
                {isVoting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Confirm & Cast Vote</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
                disabled={isVoting}
            >
                <Text style={styles.cancelButtonText}>Go Back</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
        color: '#2c3e50',
    },
    summaryCard: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 15,
        marginBottom: 20,
        elevation: 3,
    },
    label: {
        fontSize: 16,
        color: '#7f8c8d',
        marginBottom: 5,
    },
    value: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 15,
    },
    warning: {
        textAlign: 'center',
        color: '#e74c3c',
        fontSize: 14,
        marginBottom: 30,
        fontStyle: 'italic',
    },
    button: {
        backgroundColor: '#27ae60',
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 15,
    },
    buttonDisabled: {
        backgroundColor: '#95a5a6',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    cancelButton: {
        padding: 15,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#3498db',
        fontSize: 16,
    },
});

export default ConfirmationScreen;

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AuthScreen from './src/screens/AuthScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CandidateSelectionScreen from './src/screens/CandidateSelectionScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';

const Stack = createStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Auth"
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#3498db',
                    },
                    headerTintColor: '#fff',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                }}
            >
                <Stack.Screen
                    name="Auth"
                    component={AuthScreen}
                    options={{ title: 'eVote India Login' }}
                />
                <Stack.Screen
                    name="Dashboard"
                    component={DashboardScreen}
                    options={{ title: 'Voting Dashboard' }}
                />
                <Stack.Screen
                    name="CandidateSelection"
                    component={CandidateSelectionScreen}
                    options={{ title: 'Choose Candidate' }}
                />
                <Stack.Screen
                    name="Confirmation"
                    component={ConfirmationScreen}
                    options={{ title: 'Confirm Vote' }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}

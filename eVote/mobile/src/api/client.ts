import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api'; // Update to actual IP for physical devices

const api = axios.create({
    baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
    // In a real app, we'd retrieve the token from secure store
    // const token = await SecureStore.getItemAsync('auth_token');
    // if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default api;

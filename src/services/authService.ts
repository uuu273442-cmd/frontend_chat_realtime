import axios from 'axios';
import toast from 'react-hot-toast';

// Toàn bộ route backend đều có tiền tố "/api" (app.setGlobalPrefix("api")
// ở main.ts), nên VITE_API_URL bắt buộc phải kết thúc bằng "/api". Nếu ai
// đó cấu hình thiếu (ví dụ đặt VITE_API_URL=https://backend.onrender.com
// thay vì https://backend.onrender.com/api trên Vercel), MỌI request REST
// sẽ bị 404 — tự thêm "/api" vào đây để lỡ cấu hình sai cũng không làm sập
// toàn bộ app.
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_URL = rawApiUrl.replace(/\/+$/, '').endsWith('/api')
  ? rawApiUrl.replace(/\/+$/, '')
  : `${rawApiUrl.replace(/\/+$/, '')}/api`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the access token to headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);

// Response interceptor to handle global error messages and exponential backoff
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    
    // Only retry on 429 (Too Many Requests) and if we haven't reached max retries (5)
    if (response?.status === 429) {
      config._retryCount = config._retryCount || 0;
      
      if (config._retryCount < 5) {
        config._retryCount += 1;
        
        // Calculate delay: 1s, 2s, 4s, 8s, 16s
        const delay = Math.pow(2, config._retryCount - 1) * 1000;
        
        // Silent retry (no console.log or toast)
        await new Promise(resolve => setTimeout(resolve, delay));
        return api(config);
      }
      
      // Final failure notification after all retries exhausted
      toast.error('Server is under heavy load. Please try again later.', {
        id: 'throttler-final-error',
      });
    }

    // Handle 401 Auth Errors for redirection
    if (response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      // Use window.location to force a clean state redirect
      window.location.href = '/';
      return Promise.reject(error);
    }

    const message = response?.data?.message || error.message;
    console.error(`[API Error]: ${message}`);
    return Promise.reject(error);
  }
);

export const authService = {
  async register(userData: any) {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  async login(credentials: any) {
    const response = await api.post('/auth/login', credentials);
    if (response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
    }
    return response.data;
  },

  async logout() {
    await api.post('/auth/logout');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  async refresh(refreshToken: string) {
    const response = await api.post('/auth/refresh', { refreshToken });
    if (response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
    }
    return response.data;
  },
};

export default api;

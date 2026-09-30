import React, { useState } from 'react';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import { motion, AnimatePresence } from 'framer-motion';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);

  const handleToggle = () => setIsLogin(!isLogin);

  return (
    // min-h-dvh thay vì min-h-screen — tránh cùng lỗi chiều cao 100vh trên di động
    // (xem chú thích trong ChatLayout.tsx)
    <div className="min-h-dvh w-full flex items-center justify-center bg-[#f0f2f5] p-4 relative overflow-hidden font-sans">
      {/* Dynamic Background Blurs */}
      <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[420px] z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-blue-200 mx-auto mb-4 transform -rotate-3">
            Z
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Zalo Hybrid</h1>
          <p className="text-gray-500 text-sm mt-1">Trải nghiệm nhắn tin thời gian thực</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={isLogin ? 'login' : 'register'}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="bg-white rounded-3xl shadow-2xl shadow-black/5 border border-white overflow-hidden p-8 md:p-10"
          >
            {isLogin ? (
              <LoginForm onToggleForm={handleToggle} onSuccess={() => {}} />
            ) : (
              <RegisterForm onToggleForm={handleToggle} onSuccess={() => {}} />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 text-center text-[11px] text-gray-400 font-bold uppercase tracking-widest">
          &copy; 2026 Zalo Hybrid Team • Bảo mật & Tin cậy
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

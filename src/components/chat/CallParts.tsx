import React from 'react';

// nền cuộc gọi: xanh zalo, nếu có avatar thì làm mờ phía sau
export const CallBackground: React.FC<{ avatar?: string | null }> = ({ avatar }) => (
  <>
    <div className="absolute inset-0 bg-gradient-to-b from-[#3d8bff] via-[#0068ff] to-[#0040a8]" />
    {avatar && (
      <img
        src={avatar}
        alt=""
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-2xl"
      />
    )}
  </>
);

// nút tròn kèm nhãn bên dưới
export const CallButton: React.FC<{
  label: string;
  onClick: () => void;
  className?: string;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}> = ({ label, onClick, className = '', size = 'lg', children }) => (
  <div className="flex flex-col items-center gap-2">
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${
        size === 'lg' ? 'h-16 w-16' : 'h-14 w-14'
      } ${className}`}
    >
      {children}
    </button>
    <span className="text-xs text-white/80">{label}</span>
  </div>
);

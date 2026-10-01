import React, { type ReactNode } from 'react';

interface ChatLayoutProps {
  primarySidebar: ReactNode;
  secondarySidebar: ReactNode;
  children: ReactNode;
  // true khi đang xem 1 cuộc trò chuyện cụ thể hoặc trang /friends —
  showDetail?: boolean;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  primarySidebar,
  secondarySidebar,
  children,
  showDetail = false,
}) => {
  return (
    // h-dvh thay vì h-screen (100vh): trên trình duyệt di động, thanh địa chỉ
    <div className="flex h-dvh w-full bg-white overflow-hidden font-sans text-[14px]">
      {/* primary sidebar */}
      {primarySidebar}

      <div className={`${showDetail ? 'hidden md:flex' : 'flex flex-1 md:flex-none'} h-full min-w-0 pb-14 md:pb-0`}>
        {secondarySidebar}
      </div>

      {/* detail view (ChatArea / ContactsView...) */}
      <main
        className={`${showDetail ? 'flex' : 'hidden md:flex'} flex-1 h-full relative bg-white overflow-hidden min-w-0 pb-14 md:pb-0`}
      >
        {children}
      </main>
    </div>
  );
};
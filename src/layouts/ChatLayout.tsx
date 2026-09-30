import React, { type ReactNode } from 'react';

interface ChatLayoutProps {
  primarySidebar: ReactNode;
  secondarySidebar: ReactNode;
  children: ReactNode;
  // true khi đang xem 1 cuộc trò chuyện cụ thể hoặc trang /friends —
  // trên mobile chỉ hiện MỘT panel tại 1 thời điểm (list HOẶC detail),
  // trên desktop (md+) vẫn hiện cả 3 cột như cũ, không đổi gì
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
    // tự ẩn/hiện khi cuộn khiến 100vh cao hơn phần màn hình thực sự nhìn thấy.
    // Hệ quả là header của cuộc trò chuyện bị đẩy lên trên, ra ngoài vùng nhìn
    // thấy khi cuộn — đây chính là lỗi "mất header khi cuộn trên điện thoại".
    // h-dvh (dynamic viewport height) luôn khớp với chiều cao hiển thị thực tế.
    <div className="flex h-dvh w-full bg-white overflow-hidden font-sans text-[14px]">
      {/* Primary sidebar — LUÔN hiện, tự chuyển thành bottom nav trên mobile
          (position: fixed bottom, xử lý bên trong SidebarPrimary) và left
          rail cố định trên desktop. Không theo showDetail nữa — giống cách
          Zalo/Messenger giữ thanh điều hướng dưới luôn có mặt. */}
      {primarySidebar}

      <div className={`${showDetail ? 'hidden md:flex' : 'flex flex-1 md:flex-none'} h-full min-w-0 pb-14 md:pb-0`}>
        {secondarySidebar}
      </div>

      {/* Detail view (ChatArea / ContactsView...) — trên mobile chỉ hiện khi
          showDetail=true, chiếm toàn màn hình; trên desktop luôn hiện.
          pb-14 trên mobile chừa chỗ cho bottom nav cố định phía dưới. */}
      <main
        className={`${showDetail ? 'flex' : 'hidden md:flex'} flex-1 h-full relative bg-white overflow-hidden min-w-0 pb-14 md:pb-0`}
      >
        {children}
      </main>
    </div>
  );
};
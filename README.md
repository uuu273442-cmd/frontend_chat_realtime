# Realtime Chat App — Frontend

Frontend React + TypeScript + Vite cho ứng dụng chat thời gian thực. Phần backend (NestJS + MongoDB + Redis + Socket.IO) và toàn bộ tài liệu chi tiết về luồng hoạt động, database, API/socket events nằm ở `../backend/README.md` — file này chỉ nói về cách chạy và cấu trúc riêng của frontend.

---

## Tech Stack

| Mục đích | Công nghệ |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| CSS | Tailwind CSS v4 (qua `@tailwindcss/postcss`) |
| Routing | React Router v7, tải theo route (`React.lazy`) |
| HTTP client | Axios (interceptor tự gắn access token, tự thử lại khi bị giới hạn 429) |
| Realtime | socket.io-client |
| Cuộc gọi | WebRTC (gọi thoại 1-1 và gọi thoại nhóm), tín hiệu qua Socket.IO |
| Icon | lucide-react |
| Animation | framer-motion (dùng ở `Modal.tsx` và `AuthPage.tsx`) |
| Thông báo UI | react-hot-toast |

## Cấu trúc thư mục

```
src/
  components/     Component dùng chung — chia theo nhóm (chat/, ui/, Auth/)
  context/        AuthContext (trạng thái đăng nhập), SocketContext (kết nối Socket.IO)
  hooks/          Hook bọc từng nhóm socket event (useCallSocket, useMessageSocket, ...)
  utils/          webrtc.ts — class PeerConnection dùng chung cho gọi 1-1 và gọi nhóm
  layouts/        ChatLayout — khung 2 cột (sidebar + nội dung) dùng chung cho các trang trong /chat
  pages/          Trang theo route: AuthPage, ChatPage, ChatContent, ContactsPage, ChatPlaceholder
  services/       Gọi API theo nhóm chức năng (authService, messageService, callService, ...)
  types/          Type dùng chung giữa các component
```

## Chạy dự án

Yêu cầu: Node.js >= 20, backend đã chạy sẵn (xem `../backend/README.md`).

```bash
npm install
cp .env.example .env   # rồi sửa VITE_API_URL trỏ tới backend
npm run dev             # http://localhost:5173
```

Các lệnh khác:

```bash
npm run build     # tsc -b && vite build — kiểm tra type rồi build ra thư mục dist/
npm run preview   # xem thử bản build production ở local
npm run lint      # eslint
```

## Biến môi trường

```env
# URL gốc của backend, BẮT BUỘC có /api ở cuối (toàn bộ route backend đều
# có tiền tố /api — thiếu đoạn này thì mọi request REST sẽ bị lỗi 404).
VITE_API_URL=http://localhost:3000/api
```

Đổi biến môi trường trên Vercel (hoặc bất kỳ nơi nào khác) không tự áp dụng
cho bản đã build sẵn — Vite gắn cứng giá trị này vào lúc `npm run build`,
không đọc lại lúc chạy. Sau khi đổi giá trị, phải build/deploy lại thì thay
đổi mới có hiệu lực.

## Cuộc gọi thoại

Chỉ hỗ trợ gọi thoại (không có video).

| File | Vai trò |
|---|---|
| `components/chat/CallModal.tsx` | Màn hình gọi 1-1 (gọi đi, có cuộc gọi đến, đang nối, đang gọi) |
| `components/chat/GroupCallModal.tsx` | Màn hình gọi thoại nhóm, mỗi người một avatar tròn |
| `components/chat/CallParts.tsx` | Nền xanh kiểu Zalo và nút tròn dùng chung cho hai màn hình trên |
| `utils/webrtc.ts` | `PeerConnection`: tạo offer/answer, giữ candidate đến sớm, thử nối lại (ICE restart), xin micro |
| `services/callService.ts` | Lấy danh sách STUN/TURN từ backend, lưu lại trong bộ nhớ tab |

Cách hoạt động ngắn gọn:

- Bên nhận bấm "Trả lời" thì chuẩn bị xong micro và kết nối rồi mới báo đã bắt máy, nên không bị mất tín hiệu đầu tiên của bên gọi.
- Khi mạng chập chờn, bên gọi tự thử nối lại tối đa 2 lần trước khi kết thúc cuộc gọi.
- Quá 30 giây (gọi 1-1) mà chưa nghe được nhau thì báo lỗi và đóng cuộc gọi.
- Socket.IO lấy access token mới mỗi lần kết nối lại, nên đổi mạng (4G sang Wi-Fi) vẫn tự kết nối lại được.

### Kiểm tra TURN khi test cuộc gọi

Mở console trình duyệt trên thiết bị đang test và chạy:

```js
localStorage.setItem('ice_transport_policy', 'relay')
```

rồi tải lại trang. Lệnh này ép trình duyệt chỉ đi qua TURN server, không thử kết nối trực tiếp qua STUN. Gọi được khi bật cờ này nghĩa là TURN hoạt động tốt. Gỡ cờ bằng `localStorage.removeItem('ice_transport_policy')`.

## Ghi chú triển khai (Vercel)

- Build production tách theo route: trang đăng nhập (`AuthPage`) và trang chat (`ChatPage` cùng các trang con) nằm ở 2 nhóm file JavaScript riêng, chỉ tải nhóm đang cần dùng. Màn hình gọi (`CallModal`, `GroupCallModal`) cũng chỉ tải khi thực sự có cuộc gọi.
- App dùng `h-dvh`/`min-h-dvh` (dynamic viewport height) thay vì `h-screen`/`min-h-screen` cho các layout toàn màn hình, để tránh lệch chiều cao trên trình duyệt di động khi thanh địa chỉ tự ẩn/hiện lúc cuộn.
- Cuộc gọi lấy danh sách máy chủ STUN/TURN từ backend (`GET /api/calls/ice-servers`) thay vì hardcode trong code. Xem `../backend/README.md` phần "Giới hạn đã biết" về việc cần cấu hình TURN để gọi ổn định giữa 2 mạng khác nhau.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { useAuth } from "./context/AuthContext";

// tải theo route (lazy)
const AuthPage       = lazy(() => import("./pages/AuthPage"));
const ChatPage       = lazy(() => import("./pages/ChatPage"));
const ChatPlaceholder = lazy(() => import("./pages/ChatPlaceholder"));
const ChatContent    = lazy(() => import("./pages/ChatContent"));
const ContactsPage   = lazy(() => import("./pages/ContactsPage"));

// màn hình chờ khi đang tải 1 chunk
const RouteLoading = () => (
    <div className="h-dvh w-full flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-blue-600" size={28} />
    </div>
);

// bo bao ve tuyen duong can dang nhap
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

// bo bao ve tuyen duong cong khai
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated } = useAuth();
    if (isAuthenticated) {
        return <Navigate to="/chat" replace />;
    }
    return <>{children}</>;
};

function App() {
    return (
        <BrowserRouter>
            <div className="App">
                <Toaster
                    position="top-right"
                    reverseOrder={false}
                    toastOptions={{
                        duration: 4000,
                        style: {
                            background: "#363636",
                            color: "#fff",
                            borderRadius: "10px",
                            fontSize: "14px",
                        },
                    }}
                />
                <Suspense fallback={<RouteLoading />}>
                <Routes>
                    {/* tuyen duong cong khai */}
                    <Route
                        path="/login"
                        element={
                            <PublicRoute>
                                <AuthPage />
                            </PublicRoute>
                        }
                    />

                    {/* tuyen duong chinh */}
                    <Route
                        path="/chat"
                        element={
                            <ProtectedRoute>
                                <ChatPage />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<ChatPlaceholder />} />
                        <Route path=":chatId" element={<ChatContent />} />
                    </Route>

                    {/* trang danh ba ban be: dung chung layout chatPage */}
                    <Route
                        path="/friends"
                        element={
                            <ProtectedRoute>
                                <ChatPage />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<ContactsPage />} />
                    </Route>

                    {/* redirect duong dan cu /friend sang /friends */}
                    <Route
                        path="/friend"
                        element={<Navigate to="/friends" replace />}
                    />

                    {/* mac dinh */}
                    <Route
                        path="/"
                        element={<Navigate to="/chat" replace />}
                    />
                    <Route
                        path="*"
                        element={<Navigate to="/" replace />}
                    />
                </Routes>
                </Suspense>
            </div>
        </BrowserRouter>
    );
}

export default App;

import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { DocPage } from "./pages/DocPage";
import { NotFound } from "./pages/NotFound";

export default function App() {
    // Mobile-friendly sidebar toggle lifted to App scope so the topbar
    // hamburger and the sidebar stay in sync across navigation.
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <Routes>
            <Route element={<Layout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />}>
                <Route index element={<Home onSidebarOpen={() => setSidebarOpen(true)} />} />
                <Route path="docs/*" element={<DocPage />} />
                <Route path="404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
            </Route>
        </Routes>
    );
}

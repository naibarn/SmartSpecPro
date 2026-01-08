import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import { FactoryPanel } from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";
import TestPage from "./pages/TestPage";

export default function App() {
  console.log("App component rendering");
  return (
    <BrowserRouter>
      <div style={{ display: "flex", height: "100vh", background: "#fff" }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: "auto" }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/factory" element={<FactoryPanel />} />
            <Route path="/chat" element={<LLMChatPage />} />
            <Route path="/terminal" element={<KiloPtyPage />} />
            <Route path="/kilo" element={<KiloCliPage />} />
            <Route path="/test" element={<TestPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

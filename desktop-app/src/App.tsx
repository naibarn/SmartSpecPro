import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import FactoryPanel from "./components/FactoryPanel";
import KiloCliPage from "./pages/KiloCli";
import KiloPtyPage from "./pages/KiloPty";
import LLMChatPage from "./pages/LLMChat";

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/factory" element={<FactoryPanel />} />
          <Route path="/chat" element={<LLMChatPage />} />
          <Route path="/terminal" element={<KiloPtyPage />} />
          <Route path="/kilo" element={<KiloCliPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

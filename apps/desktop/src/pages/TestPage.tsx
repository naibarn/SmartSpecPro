export default function TestPage() {
  return (
    <div style={{
      padding: "50px",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      minHeight: "100vh",
      color: "white",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1 style={{ fontSize: "48px", marginBottom: "20px" }}>
        🎉 TEST PAGE WORKS! 🎉
      </h1>
      <p style={{ fontSize: "24px", marginBottom: "10px" }}>
        If you can see this colorful page, React is working!
      </p>
      <p style={{ fontSize: "18px", opacity: 0.9 }}>
        Current time: {new Date().toLocaleTimeString()}
      </p>
      <div style={{ marginTop: "30px", padding: "20px", background: "rgba(255,255,255,0.2)", borderRadius: "10px" }}>
        <p style={{ fontSize: "16px" }}>✅ React Router is working</p>
        <p style={{ fontSize: "16px" }}>✅ TypeScript compilation successful</p>
        <p style={{ fontSize: "16px" }}>✅ Vite dev server running</p>
      </div>
    </div>
  );
}

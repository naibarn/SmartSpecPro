export function AudioStudioSettingsCard({ locale }: { locale: "th" | "en" }) {
  const isThai = locale === "th";

  return (
    <article className="panel wide settings-panel" data-testid="audio-studio-settings-card">
      <header className="panel-heading">
        <p className="eyebrow">AI Audio Engine</p>
        <h2>
          {isThai
            ? "ระบบแยกแทร็กเสียงภาพยนตร์ (Demucs v4 Stem Separation)"
            : "Cinematic Audio Stem Separation (Demucs v4)"}
        </h2>
        <p className="subtle">
          {isThai
            ? "Demucs แยกเสียงร้องออกจากเสียงประกอบรวม ไม่ได้แยก Foley และ Ambience เป็นคนละแทร็ก"
            : "Demucs separates vocals from combined accompaniment; it does not split Foley and ambience into separate stems."}
        </p>
      </header>

      <p className="connect-message pending" role="status" data-testid="demucs-runtime-unverified">
        {isThai
          ? "หน้านี้ยังตรวจ ติดตั้ง หรือทดสอบ Demucs ในเครื่องไม่ได้ ระบบต้องตรวจ runtime บน audio worker เมื่อเริ่มงานซ่อมเสียง"
          : "This screen cannot currently check, install, or test Demucs. The audio worker checks its runtime when an audio repair job starts."}
      </p>

      <section className="settings-grid" aria-label={isThai ? "สถานะ Demucs" : "Demucs status"}>
        <label>
          {isThai ? "สถานะ runtime" : "Runtime status"}
          <input
            readOnly
            value={isThai ? "ยังไม่ได้ตรวจสอบจากหน้านี้" : "Not verified from this screen"}
            data-testid="demucs-runtime-status"
          />
        </label>
        <label>
          {isThai ? "เครื่องที่ใช้ประมวลผล" : "Execution host"}
          <input
            readOnly
            value={isThai ? "ตรวจโดย audio worker เมื่อเริ่มงาน" : "Checked by the audio worker at job start"}
          />
        </label>
      </section>

      <section className="button-row" aria-label={isThai ? "การจัดการ Demucs" : "Demucs actions"}>
        <button
          type="button"
          className="primary-button"
          disabled
          title={isThai ? "ยังไม่มีตัวติดตั้งเชื่อมกับ Worker App" : "No installer is connected to Worker App yet"}
          data-testid="install-demucs-btn"
        >
          {isThai ? "ติดตั้ง Demucs v4 (ยังไม่พร้อม)" : "Install Demucs v4 (unavailable)"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled
          title={isThai ? "ยังไม่มีการทดสอบแยกเสียงจริงจากหน้านี้" : "A real stem-separation test is not available from this screen"}
          data-testid="test-demucs-btn"
        >
          {isThai ? "ทดสอบแยกแทร็กเสียง (ยังไม่พร้อม)" : "Test stem separation (unavailable)"}
        </button>
      </section>
    </article>
  );
}

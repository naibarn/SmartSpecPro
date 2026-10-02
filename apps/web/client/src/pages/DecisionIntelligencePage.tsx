import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, Plus, RefreshCw } from "lucide-react";
import { AppPage } from "@/components/AppPage";
import styles from "./DecisionIntelligencePage.module.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { i18n } from "@/i18n";
import { toast } from "sonner";

const PROJECT_VERSION = "decision-project-v1";
function copy(isThai: boolean) {
  return isThai ? {
    title: "Decision Intelligence", description: "พื้นที่ทำงานสำหรับตั้งโจทย์ เปรียบเทียบทางเลือก และติดตามหลักฐานประกอบการตัดสินใจ",
    newProject: "สร้างโครงการ", projects: "โครงการของฉัน", projectTitle: "ชื่อโครงการ", goal: "เป้าหมายการตัดสินใจ",
    domains: "ขอบเขตข้อมูล (คั่นด้วยจุลภาค)", geography: "พื้นที่ที่เกี่ยวข้อง (ถ้ามี)", create: "บันทึกโครงการ", cancel: "ยกเลิก",
    empty: "ยังไม่มีโครงการ", emptyHint: "สร้างโครงการแรกเพื่อเก็บโจทย์และขอบเขตหลักฐานไว้ในพื้นที่ของคุณ",
    loadError: "โหลดโครงการไม่สำเร็จ", retry: "ลองอีกครั้ง", createError: "สร้างโครงการไม่สำเร็จ", created: "สร้างโครงการแล้ว",
    historyError: "โหลดประวัติการวิเคราะห์ไม่สำเร็จ",
    status: "สถานะ", goalLabel: "เป้าหมาย",
    runHistory: "ประวัติการวิเคราะห์", noRuns: "ยังไม่มีผลวิเคราะห์ที่บันทึกไว้", runtimeNote: "การสั่งค้นคว้าและวิเคราะห์จะเปิดใช้เมื่อเชื่อมต่อ policy, research runtime และ Task Control ครบแล้ว หน้านี้จะไม่สร้างผลวิเคราะห์จำลอง",
    refresh: "โหลดใหม่", loading: "กำลังโหลดโครงการ…", generalDomain: "domain:general", placeholder: "เช่น เลือกทำเลเปิดคลังสินค้า",
    statuses: { draft: "ฉบับร่าง", collecting_evidence: "กำลังรวบรวมหลักฐาน", analyzing: "กำลังวิเคราะห์", waiting_user: "รอข้อมูลจากคุณ", monitoring: "ติดตามต่อเนื่อง", closed: "ปิดโครงการ" },
  } : {
    title: "Decision Intelligence", description: "Frame a decision, compare alternatives, and keep its evidence scope in one workspace.",
    newProject: "New project", projects: "My projects", projectTitle: "Project name", goal: "Decision goal",
    domains: "Data domains (comma separated)", geography: "Geographies (optional)", create: "Save project", cancel: "Cancel",
    empty: "No projects yet", emptyHint: "Create your first project to save its question and evidence scope.",
    loadError: "Could not load projects", retry: "Retry", createError: "Could not create project", created: "Project created",
    historyError: "Could not load analysis history",
    status: "Status", goalLabel: "Goal",
    runHistory: "Analysis history", noRuns: "No analysis result has been recorded yet", runtimeNote: "Research and analysis actions become available after policy, research runtime, and Task Control are connected. This page will not invent results.",
    refresh: "Refresh", loading: "Loading projects…", generalDomain: "domain:general", placeholder: "e.g. Choose a location for a new warehouse",
    statuses: { draft: "Draft", collecting_evidence: "Collecting evidence", analyzing: "Analyzing", waiting_user: "Waiting for you", monitoring: "Monitoring", closed: "Closed" },
  };
}

function splitReferences(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

export default function DecisionIntelligencePage() {
  const isThai = i18n.language.toLowerCase().startsWith("th");
  const text = copy(isThai);
  const utils = trpc.useUtils();
  const projectsQuery = trpc.decisionIntelligence.listProjects.useQuery();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [domains, setDomains] = useState(text.generalDomain);
  const [geographies, setGeographies] = useState("");
  const createProject = trpc.decisionIntelligence.createProject.useMutation({
    onSuccess: async project => {
      toast.success(text.created);
      setTitle(""); setGoal(""); setDomains(text.generalDomain); setGeographies(""); setIsCreating(false); setSelectedId(project.id);
      await utils.decisionIntelligence.listProjects.invalidate();
    },
    onError: () => toast.error(text.createError),
  });
  const projects = projectsQuery.data ?? [];
  const selected = useMemo(() => projects.find(project => project.id === selectedId) ?? null, [projects, selectedId]);
  const runsQuery = trpc.decisionIntelligence.listAnalysisRuns.useQuery({ projectId: selected?.id ?? "" }, { enabled: Boolean(selected?.id) });

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domainRefs = splitReferences(domains);
    if (domainRefs.length === 0) { toast.error(text.createError); return; }
    await createProject.mutateAsync({
      title: title.trim(),
      projectJson: {
        version: PROJECT_VERSION,
        domainRefs,
        geographyRefs: splitReferences(geographies),
        goal: goal.trim(),
      },
    });
  }

  return (
    <AppPage
      title={text.title}
      description={text.description}
      breadcrumbs={[{ label: "Home", href: "/" }, { label: text.title }]}
      actions={<Button variant="outline" onClick={() => void projectsQuery.refetch()} disabled={projectsQuery.isFetching}><RefreshCw aria-hidden="true" />{text.refresh}</Button>}
      state={projectsQuery.isLoading ? "loading" : projectsQuery.isError ? "error" : "ready"}
      error={{ title: text.loadError, onRetry: () => void projectsQuery.refetch() }}
    >
      <section className={styles.workspace}>
        <section aria-label={text.projects} className={styles.projectSection}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{text.projects}<small className={styles.projectCount}>{projects.length}</small></h2>
            <Button onClick={() => setIsCreating(value => !value)}><Plus aria-hidden="true" />{text.newProject}</Button>
          </header>
          {isCreating && <Card>
            <CardHeader><CardTitle>{text.newProject}</CardTitle><CardDescription>{text.description}</CardDescription></CardHeader>
            <CardContent>
              <form className={styles.form} onSubmit={event => void submitProject(event)}>
                <fieldset disabled={createProject.isPending} className={styles.fieldset}>
                  <Label className={styles.fieldLabel}>{text.projectTitle}<Input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></Label>
                  <Label className={styles.fieldLabel}>{text.domains}<Input required value={domains} onChange={event => setDomains(event.target.value)} /></Label>
                  <Label className={styles.fieldLabel}>{text.goal}<Textarea required maxLength={4000} placeholder={text.placeholder} value={goal} onChange={event => setGoal(event.target.value)} /></Label>
                  <Label className={styles.fieldLabel}>{text.geography}<Input value={geographies} onChange={event => setGeographies(event.target.value)} /></Label>
                </fieldset>
                <footer className={styles.actions}>
                  <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>{text.cancel}</Button>
                  <Button type="submit" disabled={createProject.isPending}>{text.create}</Button>
                </footer>
              </form>
            </CardContent>
          </Card>}
          {projects.length === 0 ? <Card><CardContent className={styles.emptyState}>
            <BriefcaseBusiness aria-hidden="true" className={styles.muted} />
            <h3>{text.empty}</h3><p className={styles.muted}>{text.emptyHint}</p>
            {!isCreating && <Button variant="outline" onClick={() => setIsCreating(true)}><Plus aria-hidden="true" />{text.newProject}</Button>}
          </CardContent></Card> : <ul className={styles.projectList}>
            {projects.map(project => <li key={project.id}>
              <Card className={selected?.id === project.id ? styles.selectedProject : undefined}>
                <CardHeader><CardTitle>{project.title}</CardTitle><CardDescription>{text.status}: {text.statuses[project.status]}</CardDescription></CardHeader>
                <CardContent className={styles.projectActions}>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(project.id)} aria-pressed={selected?.id === project.id}>{isThai ? "เปิดโครงการ" : "Open project"}<ArrowRight aria-hidden="true" /></Button>
                </CardContent>
              </Card>
            </li>)}
          </ul>}
        </section>

        {selected && <section aria-label={selected.title} className={styles.detailSection}>
          <Card>
            <CardHeader><CardTitle>{selected.title}</CardTitle><CardDescription>{text.goalLabel}: {selected.projectJson.goal}</CardDescription></CardHeader>
            <CardContent className={styles.detailContent}>
              <p className={styles.projectStatus} aria-label={text.status}>{text.status}: {text.statuses[selected.status]}</p>
              <section aria-label={text.runHistory} className={styles.historySection}>
                <h3>{text.runHistory}</h3>
                {runsQuery.isLoading ? <p role="status">{text.loading}</p> : runsQuery.isError ? <p role="alert">{text.historyError}</p> : runsQuery.data?.length ? <ol className={styles.runList}>{runsQuery.data.map(run => <li key={run.id}>{run.status} · {new Date(run.createdAt).toLocaleString()}</li>)}</ol> : <p className={styles.muted}>{text.noRuns}</p>}
              </section>
            </CardContent>
          </Card>
          <Card><CardContent className={styles.runtimeNote}>{text.runtimeNote}</CardContent></Card>
        </section>}
      </section>
    </AppPage>
  );
}

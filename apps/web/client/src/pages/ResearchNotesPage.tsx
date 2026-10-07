import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";

type ResearchProject = { projectId: string; title: string };
type ResearchNote = { noteId: string; title: string; content: string; updatedAt: Date | string };

export default function ResearchNotesPage() {
  const [, params] = useRoute("/apps/:publicAppId");
  const publicAppId = params?.publicAppId ?? "";
  const utils = trpc.useUtils();
  const appQuery = trpc.appIdentity.resolvePublicApp.useQuery(
    { publicAppId },
    { enabled: Boolean(publicAppId), retry: false },
  );
  const appId = appQuery.data?.appId ?? "";
  const projectsQuery = trpc.researchNotes.listProjects.useQuery(
    { appId },
    { enabled: Boolean(appId) },
  );
  const projects = (projectsQuery.data ?? []) as ResearchProject[];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const projectId = projects.some(project => project.projectId === selectedProjectId)
    ? selectedProjectId
    : projects[0]?.projectId ?? "";
  const notesQuery = trpc.researchNotes.listNotes.useQuery(
    { appId, projectId },
    { enabled: Boolean(appId && projectId) },
  );
  const notes = (notesQuery.data ?? []) as ResearchNote[];
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const selectedNote = notes.find(note => note.noteId === selectedNoteId) ?? null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [saveError, setSaveError] = useState("");

  const projectOptions = useMemo(() => projects.map(project => ({
    value: project.projectId,
    label: project.title,
  })), [projects]);
  const refreshProjects = () => utils.researchNotes.listProjects.invalidate({ appId });
  const refreshNotes = () => utils.researchNotes.listNotes.invalidate({ appId, projectId });

  const createProject = trpc.researchNotes.createProject.useMutation({
    onSuccess: async (project: ResearchProject) => {
      setSelectedProjectId(project.projectId);
      setNewProjectTitle("");
      setShowProjectForm(false);
      await refreshProjects();
    },
    onError: error => setSaveError(error.message),
  });
  const createNote = trpc.researchNotes.createNote.useMutation({
    onSuccess: async (note: ResearchNote) => {
      setSelectedNoteId(note.noteId);
      setTitle(note.title);
      setContent(note.content);
      setSaveError("");
      await refreshNotes();
    },
    onError: error => setSaveError(error.message),
  });
  const updateNote = trpc.researchNotes.updateNote.useMutation({
    onSuccess: async note => {
      setSaveError("");
      await refreshNotes();
      setSelectedNoteId(note.noteId);
    },
    onError: error => setSaveError(error.message),
  });
  const archiveNote = trpc.researchNotes.archiveNote.useMutation({
    onSuccess: async () => {
      setSelectedNoteId("");
      setTitle("");
      setContent("");
      await refreshNotes();
    },
    onError: error => setSaveError(error.message),
  });

  function selectNote(note: ResearchNote) {
    setSelectedNoteId(note.noteId);
    setTitle(note.title);
    setContent(note.content);
    setSaveError("");
  }

  function startNewNote() {
    setSelectedNoteId("");
    setTitle("");
    setContent("");
    setSaveError("");
  }

  function saveCurrentNote() {
    if (!projectId || !appId) return;
    setSaveError("");
    if (selectedNote) {
      updateNote.mutate({ appId, projectId, noteId: selectedNote.noteId, title, content });
    } else {
      createNote.mutate({ appId, projectId, title, content });
    }
  }

  const pageState = appQuery.isLoading || (Boolean(appId) && projectsQuery.isLoading)
    ? "loading"
    : appQuery.isError || projectsQuery.isError
      ? "error"
      : "ready";

  return (
    <AppPage
      title="Research Notes"
      description="Keep source notes with the project, then summarize and share them through your app."
      state={pageState}
      error={{
        title: "This App is unavailable",
        description: "Check the app link and your tenant access, then try again.",
        onRetry: () => { void appQuery.refetch(); void projectsQuery.refetch(); },
      }}
      actions={projectId ? <Button label="New note" variant="primary" onClick={startNewNote} /> : undefined}
    >
      <VStack gap={5}>
        <HStack gap={3} align="end" wrap="wrap">
          {projects.length > 0 ? (
            <Selector
              label="Project"
              value={projectId}
              options={projectOptions}
              onChange={value => { setSelectedProjectId(value); setSelectedNoteId(""); }}
              hasSearch={projects.length > 5}
              width="100%"
            />
          ) : <Text type="supporting">Create a project to keep notes in an authorized shared workspace.</Text>}
          <Button
            label={showProjectForm ? "Cancel" : "New project"}
            variant="secondary"
            onClick={() => setShowProjectForm(value => !value)}
          />
        </HStack>

        {showProjectForm ? (
          <Card padding={4}>
            <VStack gap={3}>
              <TextInput
                label="Project name"
                value={newProjectTitle}
                onChange={value => setNewProjectTitle(value)}
                placeholder="e.g. Q4 market research"
                isRequired
              />
              <HStack gap={2}>
                <Button
                  label="Create project"
                  variant="primary"
                  isLoading={createProject.isPending}
                  isDisabled={!newProjectTitle.trim() || !appId}
                  onClick={() => createProject.mutate({ appId, title: newProjectTitle.trim() })}
                />
                {createProject.error ? <Text color="accent">{createProject.error.message}</Text> : null}
              </HStack>
            </VStack>
          </Card>
        ) : null}

        {projectId ? (
          <Grid columns={{ minWidth: 280, max: 2 }} gap={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Text weight="semibold">Notes</Text>
                <Button label="New" variant="ghost" onClick={startNewNote} />
              </HStack>
              <Divider />
              {notesQuery.isLoading ? <Text type="supporting">Loading notes…</Text> : null}
              {!notesQuery.isLoading && notes.length === 0 ? (
                <Card padding={4}>
                  <VStack gap={2}>
                    <Text weight="semibold">No notes yet</Text>
                    <Text type="supporting">Create a note to collect sources and project findings.</Text>
                    <Button label="Create first note" variant="secondary" onClick={startNewNote} />
                  </VStack>
                </Card>
              ) : null}
              {notes.map(note => (
                <Button
                  key={note.noteId}
                  label={note.title}
                  variant={note.noteId === selectedNote?.noteId ? "primary" : "secondary"}
                  onClick={() => selectNote(note)}
                />
              ))}
              {notesQuery.isError ? <Text color="accent">Could not load notes. Try again.</Text> : null}
            </VStack>

            <Card padding={4}>
              <VStack gap={4}>
                <TextInput
                  label="Note title"
                  value={title}
                  onChange={value => setTitle(value)}
                  placeholder="Add a clear title"
                  isRequired
                />
                <TextArea
                  label="Research note"
                  value={content}
                  onChange={value => setContent(value)}
                  placeholder="Capture a source, observation, or open question…"
                  rows={12}
                  maxLength={262_144}
                />
                {saveError ? <Text color="accent">{saveError}</Text> : null}
                <HStack gap={2} wrap="wrap">
                  <Button
                    label={selectedNote ? "Save changes" : "Save note"}
                    variant="primary"
                    isLoading={createNote.isPending || updateNote.isPending}
                    isDisabled={!title.trim() || !projectId}
                    onClick={saveCurrentNote}
                  />
                  {selectedNote ? (
                    <Button
                      label="Archive note"
                      variant="secondary"
                      isLoading={archiveNote.isPending}
                      onClick={() => archiveNote.mutate({ appId, projectId, noteId: selectedNote.noteId })}
                    />
                  ) : null}
                </HStack>
              </VStack>
            </Card>
          </Grid>
        ) : null}
      </VStack>
    </AppPage>
  );
}

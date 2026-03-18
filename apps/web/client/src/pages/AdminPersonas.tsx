/**
 * AdminPersonas — Admin page for managing tenant-scope and platform-scope personas.
 *
 * - CRUD for tenant-scope personas (domain_admin)
 * - CRUD for platform-scope personas (admin)
 * - Token overhead preview
 * - Table listing all personas with scope, author, usage stats
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

const TONE_OPTIONS = ["formal", "casual", "friendly", "technical", "creative"] as const;
const SCOPE_OPTIONS = ["platform", "tenant"] as const;
const GENDER_OPTIONS = ["female", "male", "neutral"] as const;

interface PersonaFormData {
  name: string;
  description: string;
  assistantNickname: string;
  assistantGender: "female" | "male" | "neutral";
  systemPromptPrefix: string;
  tone: string;
  language: string;
  restrictions: string[];
  scope: "platform" | "tenant";
}

const emptyForm: PersonaFormData = {
  name: "",
  description: "",
  assistantNickname: "",
  assistantGender: "neutral",
  systemPromptPrefix: "",
  tone: "friendly",
  language: "auto",
  restrictions: [],
  scope: "platform",
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export default function AdminPersonas() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaFormData>(emptyForm);
  const [newRestriction, setNewRestriction] = useState("");

  const utils = trpc.useUtils();
  const { data: personas, isLoading } = trpc.persona.list.useQuery();

  const createMutation = trpc.persona.create.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      resetForm();
      toast.success("Persona created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.persona.update.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      resetForm();
      toast.success("Persona updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.persona.delete.useMutation({
    onSuccess: () => {
      utils.persona.list.invalidate();
      toast.success("Persona deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const setTenantDefaultMutation = trpc.persona.setTenantDefault.useMutation({
    onSuccess: () => toast.success("Tenant default updated"),
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function handleSubmit() {
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        description: form.description || null,
        assistantNickname: form.assistantNickname || null,
        assistantGender: form.assistantGender,
        systemPromptPrefix: form.systemPromptPrefix,
        tone: form.tone as any,
        language: form.language,
        restrictions: form.restrictions,
      });
    } else {
      createMutation.mutate({
        ...form,
        description: form.description || null,
        assistantNickname: form.assistantNickname || null,
        assistantGender: form.assistantGender,
        tone: form.tone as any,
      });
    }
  }

  function handleEdit(persona: any) {
    setForm({
      name: persona.name,
      description: persona.description || "",
      assistantNickname: persona.assistantNickname || "",
      assistantGender: persona.assistantGender || "neutral",
      systemPromptPrefix: persona.systemPromptPrefix,
      tone: persona.tone || "friendly",
      language: persona.language || "auto",
      restrictions: persona.restrictions || [],
      scope: persona.scope,
    });
    setEditingId(persona.id);
    setShowForm(true);
  }

  function addRestriction() {
    if (newRestriction.trim() && form.restrictions.length < 20) {
      setForm((prev) => ({
        ...prev,
        restrictions: [...prev.restrictions, newRestriction.trim()],
      }));
      setNewRestriction("");
    }
  }

  function removeRestriction(index: number) {
    setForm((prev) => ({
      ...prev,
      restrictions: prev.restrictions.filter((_, i) => i !== index),
    }));
  }

  // Split by scope for display
  const platformPersonas = personas?.filter((p) => p.scope === "platform") || [];
  const tenantPersonas = personas?.filter((p) => p.scope === "tenant") || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Manage AI Personas</h1>
            <p className="text-muted-foreground">
              Create and manage platform-wide and tenant-specific AI persona templates.
            </p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            New Persona
          </Button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingId ? "Edit Persona" : "New Persona"}</CardTitle>
              <CardDescription>
                Define AI assistant behavior. Token overhead: ~{estimateTokens(form.systemPromptPrefix)} tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Professional Advisor"
                  />
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select
                    value={form.scope}
                    onValueChange={(v) => setForm((f) => ({ ...f, scope: v as any }))}
                    disabled={!!editingId}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tone</Label>
                  <Select
                    value={form.tone}
                    onValueChange={(v) => setForm((f) => ({ ...f, tone: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>AI Nickname</Label>
                  <Input
                    value={form.assistantNickname}
                    onChange={(e) => setForm((f) => ({ ...f, assistantNickname: e.target.value }))}
                    placeholder="e.g., น้องเจน"
                  />
                </div>
                <div>
                  <Label>Gender Style</Label>
                  <Select
                    value={form.assistantGender}
                    onValueChange={(v) => setForm((f) => ({ ...f, assistantGender: v as PersonaFormData["assistantGender"] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((gender) => (
                        <SelectItem key={gender} value={gender}>
                          {gender.charAt(0).toUpperCase() + gender.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <Label>System Prompt Prefix (max 2000 chars)</Label>
                <Textarea
                  value={form.systemPromptPrefix}
                  onChange={(e) => setForm((f) => ({ ...f, systemPromptPrefix: e.target.value }))}
                  rows={5}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.systemPromptPrefix.length}/2000 chars | ~{estimateTokens(form.systemPromptPrefix)} tokens overhead
                </p>
              </div>

              <div>
                <Label>Language</Label>
                <Input
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  placeholder="auto"
                />
              </div>

              <div>
                <Label>Restrictions (max 20)</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newRestriction}
                    onChange={(e) => setNewRestriction(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRestriction())}
                  />
                  <Button variant="outline" size="sm" onClick={addRestriction}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.restrictions.map((r, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {r}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeRestriction(i)} />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!form.name || !form.systemPromptPrefix || createMutation.isPending || updateMutation.isPending}
                >
                  {editingId ? "Update" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personas Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Personas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Tone</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Token Overhead</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...platformPersonas, ...tenantPersonas].map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.assistantNickname && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">@{p.assistantNickname}</Badge>
                        )}
                        {p.isDefault && (
                          <Badge variant="default" className="ml-2 text-[10px]">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.scope}</Badge>
                      </TableCell>
                      <TableCell>{p.tone || "—"}</TableCell>
                      <TableCell>{p.language || "auto"}</TableCell>
                      <TableCell>~{estimateTokens(p.systemPromptPrefix)} tokens</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTenantDefaultMutation.mutate({ personaId: p.id })}
                            title="Set as tenant default"
                          >
                            Set Default
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Delete this persona?")) {
                                deleteMutation.mutate({ id: p.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

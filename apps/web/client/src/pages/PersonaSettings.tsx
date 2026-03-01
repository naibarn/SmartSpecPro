/**
 * PersonaSettings — User settings page for managing personal AI personas.
 *
 * - CRUD for user-scope personas
 * - Set default persona
 * - Form: name, description, system prompt prefix, tone, language,
 *   response style, restrictions array
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Star, X } from "lucide-react";
import { toast } from "sonner";

const TONE_OPTIONS = ["formal", "casual", "friendly", "technical", "creative"] as const;

interface PersonaFormData {
  name: string;
  description: string;
  systemPromptPrefix: string;
  tone: string;
  language: string;
  restrictions: string[];
}

const emptyForm: PersonaFormData = {
  name: "",
  description: "",
  systemPromptPrefix: "",
  tone: "friendly",
  language: "auto",
  restrictions: [],
};

export default function PersonaSettings() {
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

  const setDefaultMutation = trpc.persona.setUserDefault.useMutation({
    onSuccess: () => {
      toast.success("Default persona updated");
    },
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
        systemPromptPrefix: form.systemPromptPrefix,
        tone: form.tone as any,
        language: form.language,
        restrictions: form.restrictions,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        description: form.description || null,
        systemPromptPrefix: form.systemPromptPrefix,
        tone: form.tone as any,
        language: form.language,
        restrictions: form.restrictions,
        scope: "user",
      });
    }
  }

  function handleEdit(persona: any) {
    setForm({
      name: persona.name,
      description: persona.description || "",
      systemPromptPrefix: persona.systemPromptPrefix,
      tone: persona.tone || "friendly",
      language: persona.language || "auto",
      restrictions: persona.restrictions || [],
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

  const userPersonas = personas?.filter((p) => p.scope === "user") || [];
  const otherPersonas = personas?.filter((p) => p.scope !== "user") || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">AI Personas</h1>
            <p className="text-muted-foreground">
              Customize AI assistant behavior with reusable persona templates.
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
                Define how the AI assistant should behave.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Professional Advisor"
                  />
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

              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description of this persona"
                />
              </div>

              <div>
                <Label>System Prompt Prefix (max 2000 chars)</Label>
                <Textarea
                  value={form.systemPromptPrefix}
                  onChange={(e) => setForm((f) => ({ ...f, systemPromptPrefix: e.target.value }))}
                  placeholder="Instructions for the AI assistant..."
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.systemPromptPrefix.length}/2000 characters
                </p>
              </div>

              <div>
                <Label>Language</Label>
                <Input
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  placeholder="auto (or e.g., th, en, ja)"
                />
              </div>

              <div>
                <Label>Restrictions (max 20)</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newRestriction}
                    onChange={(e) => setNewRestriction(e.target.value)}
                    placeholder="Add a restriction..."
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRestriction())}
                  />
                  <Button variant="outline" size="sm" onClick={addRestriction}>
                    Add
                  </Button>
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

              {/* Prompt Preview */}
              {form.systemPromptPrefix && (
                <div>
                  <Label>Preview</Label>
                  <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-32 overflow-auto">
                    [PERSONA START]{"\n"}
                    {form.systemPromptPrefix}{"\n"}
                    [PERSONA END]
                  </pre>
                </div>
              )}

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

        {/* User's Personas */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Your Personas</h2>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : userPersonas.length === 0 ? (
            <p className="text-muted-foreground">No personal personas yet. Create one above.</p>
          ) : (
            <div className="grid gap-3">
              {userPersonas.map((p) => (
                <Card key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {p.name}
                      {p.tone && <Badge variant="outline" className="text-[10px]">{p.tone}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {p.description || p.systemPromptPrefix.slice(0, 80)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Set as default"
                      onClick={() => setDefaultMutation.mutate({ personaId: p.id })}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate({ id: p.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Platform & Tenant Personas (read-only for users) */}
        {otherPersonas.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Available Personas</h2>
            <div className="grid gap-3">
              {otherPersonas.map((p) => (
                <Card key={p.id} className="p-4 opacity-80">
                  <div className="font-medium flex items-center gap-2">
                    {p.name}
                    <Badge variant="outline" className="text-[10px]">{p.scope}</Badge>
                    {p.tone && <Badge variant="outline" className="text-[10px]">{p.tone}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {p.description || p.systemPromptPrefix.slice(0, 80)}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

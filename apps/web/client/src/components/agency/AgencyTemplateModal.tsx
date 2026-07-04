import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface AgencyTemplateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AgencyTemplateModal({ open, onOpenChange }: AgencyTemplateModalProps) {
    const [, setLocation] = useLocation();
    const { data, isLoading } = trpc.agency.listTemplates.useQuery(undefined, { enabled: open });
    const createFromTemplate = trpc.agency.createFromTemplate.useMutation();
    const [creatingId, setCreatingId] = useState<string | null>(null);

    const startBlank = () => {
        onOpenChange(false);
        setLocation("/agencies/new/edit");
    };

    const useTemplate = async (templateId: string) => {
        try {
            setCreatingId(templateId);
            const result = await createFromTemplate.mutateAsync({ agencyTemplateId: templateId });
            toast.success("Agency created from template");
            onOpenChange(false);
            setLocation(`/agencies/${result.id}/edit`);
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to create from template");
            setCreatingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl">Create a New Agency</DialogTitle>
                    <DialogDescription className="text-base text-slate-500">
                        Start from scratch or choose a pre-configured 1-click template.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Start from Blank Card */}
                    <div
                        onClick={startBlank}
                        className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors group aspect-square md:aspect-auto"
                    >
                        <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 mb-4 group-hover:scale-110 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                            <Plus className="h-7 w-7" />
                        </div>
                        <h3 className="font-semibold text-slate-800 text-lg">Start from Blank</h3>
                        <p className="text-sm text-slate-500 mt-2">Build your agency layout from an empty canvas.</p>
                    </div>

                    {isLoading ? (
                        <div className="col-span-full py-16 flex justify-center items-center">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        </div>
                    ) : (
                        data?.templates?.map((t: any) => (
                            <div
                                key={t.id}
                                onClick={() => !creatingId && useTemplate(t.id)}
                                className={`border border-slate-200 rounded-xl p-6 flex flex-col relative overflow-hidden transition-all bg-white aspect-square md:aspect-auto ${creatingId ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-indigo-400 hover:shadow-lg hover:-translate-y-1 group"
                                    }`}
                            >
                                {creatingId === t.id && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                        <Briefcase className="h-6 w-6" />
                                    </div>
                                    <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 rounded-full text-slate-500 uppercase tracking-widest">
                                        {t.category}
                                    </span>
                                </div>

                                <h3 className="font-bold text-slate-800 text-lg leading-tight mb-2">{t.name}</h3>
                                <p className="text-sm text-slate-600 flex-1 leading-relaxed">{t.description}</p>

                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <div className="text-indigo-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                                        Use Template <span>→</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

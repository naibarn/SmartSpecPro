import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Calendar, Clock, Repeat } from 'lucide-react';
import { toast } from 'sonner';

export interface ScheduleData {
    isRecurring: boolean;
    cronExpression?: string;
    scheduledAt?: string;
    emailNotify: boolean;
    priority: "low" | "normal" | "high" | "critical";
    timezone: string;
}

interface ScheduleSkillDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSchedule: (data: ScheduleData) => void;
    skillName: string;
}

export function ScheduleSkillDialog({
    open,
    onOpenChange,
    onSchedule,
    skillName,
}: ScheduleSkillDialogProps) {
    const [isRecurring, setIsRecurring] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [cron, setCron] = useState('');
    const [emailNotify, setEmailNotify] = useState(true);
    const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
    const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

    const handleSubmit = () => {
        if (isRecurring) {
            if (!cron.trim()) {
                toast.error('Please enter a cron expression or select a preset');
                return;
            }
            onSchedule({
                isRecurring: true,
                cronExpression: cron,
                emailNotify,
                priority,
                timezone,
            });
        } else {
            if (!date || !time) {
                toast.error('Please select both date and time');
                return;
            }
            const scheduledAt = new Date(`${date}T${time}`);
            if (scheduledAt <= new Date()) {
                toast.error('Schedule time must be in the future');
                return;
            }
            onSchedule({
                isRecurring: false,
                scheduledAt: scheduledAt.toISOString(),
                emailNotify,
                priority,
                timezone,
            });
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Schedule Skill Execution</DialogTitle>
                    <DialogDescription>
                        Set up an automated run for <strong>{skillName}</strong>.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-between border-b pb-4">
                        <Label htmlFor="recurring" className="flex flex-col gap-1">
                            <span className="flex items-center gap-2">
                                <Repeat className="h-4 w-4 text-muted-foreground" />
                                Recurring Schedule
                            </span>
                            <span className="font-normal text-xs text-muted-foreground">
                                Run this skill on a repeating cron schedule
                            </span>
                        </Label>
                        <Switch
                            id="recurring"
                            checked={isRecurring}
                            onCheckedChange={setIsRecurring}
                        />
                    </div>

                    {!isRecurring ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" /> Date
                                    </Label>
                                    <Input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" /> Time
                                    </Label>
                                    <Input
                                        type="time"
                                        value={time}
                                        onChange={(e) => setTime(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <Label>Cron Expression</Label>
                            <Input
                                placeholder="e.g. 0 9 * * 1-5"
                                value={cron}
                                onChange={(e) => setCron(e.target.value)}
                            />
                            <div className="flex gap-2 text-xs flex-wrap">
                                <Button variant="secondary" size="sm" onClick={() => setCron("0 9 * * *")}>Daily 9AM</Button>
                                <Button variant="secondary" size="sm" onClick={() => setCron("0 9 * * 1-5")}>Weekdays 9AM</Button>
                                <Button variant="secondary" size="sm" onClick={() => setCron("0 12 * * 1")}>Weekly Mon 12PM</Button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-3 mt-4">
                        <Label>Notification & Priority</Label>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="email-notify" className="font-normal text-sm">Send Email Notification</Label>
                            <Switch id="email-notify" checked={emailNotify} onCheckedChange={setEmailNotify} />
                        </div>
                        <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High (Full screen alert)</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex flex-col gap-2 mt-2">
                            <Label className="font-normal text-sm">Timezone</Label>
                            <Select value={timezone} onValueChange={(v: string) => setTimezone(v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Asia/Bangkok">Asia/Bangkok (ICT)</SelectItem>
                                    <SelectItem value="UTC">UTC</SelectItem>
                                    <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                                    <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                                    <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                                    <SelectItem value="Europe/Paris">Central European Time (CET)</SelectItem>
                                    <SelectItem value="Asia/Tokyo">Japan Standard Time (JST)</SelectItem>
                                    <SelectItem value="Asia/Singapore">Singapore Standard Time (SGT)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Schedule</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** User-visible automation contract for Video Studio projects.
 *
 * Keep this deliberately smaller than Work OS automation modes. Video Studio
 * only needs to distinguish the guided workflow from the manual editing
 * workflow; generation jobs and approval gates remain available in both.
 */
export const VIDEO_AUTOMATION_MODES = ["guided", "manual"] as const;
export type VideoAutomationMode = (typeof VIDEO_AUTOMATION_MODES)[number];

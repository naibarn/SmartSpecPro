/**
 * MyInviteCode — Shows user's personal invite/referral code
 * Displayed in the Credits page when user referrals are enabled
 */

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Copy, Users, Gift } from "lucide-react";
import { toast } from "sonner";

export default function MyInviteCode() {
  const { data, isLoading } = trpc.inviteCode.getMyCode.useQuery();
  const { data: stats } = trpc.inviteCode.getMyReferralStats.useQuery(undefined, {
    enabled: data?.enabled === true,
  });

  if (isLoading || !data?.enabled || !data.code) return null;

  const code = data.code;
  const shareLink = `${window.location.origin}/signup?invite=${code.code}`;

  const copyCode = () => {
    navigator.clipboard.writeText(code.code);
    toast.success("Invite code copied!");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success("Invite link copied!");
  };

  return (
    <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold text-sm">Your Referral Code</h3>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <code className="flex-1 bg-white px-4 py-2 rounded-lg border font-mono text-lg tracking-wider text-center">
          {code.code}
        </code>
        <Button variant="outline" size="sm" onClick={copyCode} title="Copy code">
          <Copy className="w-4 h-4" />
        </Button>
      </div>

      <Button variant="outline" size="sm" className="w-full mb-3" onClick={copyLink}>
        Copy invite link
      </Button>

      {stats && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{stats.totalReferrals} people joined</span>
          </div>
          {stats.totalCreditsEarned > 0 && (
            <span className="text-green-600 font-medium">
              +{stats.totalCreditsEarned} credits earned
            </span>
          )}
        </div>
      )}
    </div>
  );
}

# Funnel Dashboard - Frequently Asked Questions (FAQ)

**Last Updated**: February 17, 2026
**Version**: 1.0
**For**: Domain Administrator Users

---

## Table of Contents

1. [General Questions](#general-questions)
2. [Access and Permissions](#access-and-permissions)
3. [Understanding Data](#understanding-data)
4. [Using the Dashboard](#using-the-dashboard)
5. [Exporting Data](#exporting-data)
6. [Data Privacy and Security](#data-privacy-and-security)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Topics](#advanced-topics)

---

## General Questions

### Q1: What is the Funnel Dashboard?

**A**: The Funnel Dashboard is an analytics tool that shows how users move through your product's customer journey - from signing up (acquisition) to using features (activation) to making purchases (revenue). It helps you understand user behavior and identify opportunities for improvement.

Think of it like a report card for your product that shows where users are getting stuck and what's working well.

**Related**: See [Introduction section in User Guide](./funnel-dashboard-domain-admin.md#introduction)

---

### Q2: Who can access the Funnel Dashboard?

**A**: Two types of users can access the dashboard:

1. **System Administrators** - Can see data across all domains
2. **Domain Administrators** - Can see data only for their specific domain

Regular users cannot access the dashboard. If you need access, ask your system administrator to grant you the domain_admin role.

**Note**: The feature is currently rolling out in phases. Even with correct permissions, your organization may not have it enabled yet.

---

### Q3: How often is the dashboard data updated?

**A**: New events appear in the dashboard within **5 minutes** of when they happen. For example, if a user signs up at 2:00 PM, that signup will show in your dashboard by 2:05 PM.

**For real-time monitoring**: Enable the auto-refresh toggle (updates every 30 seconds) to keep your dashboard current without manually refreshing.

**Cached data**: Some complex aggregations use a 5-minute cache to keep the dashboard fast. You can force fresh data by clicking any "Clear Cache" or "Refresh" button if available.

---

### Q4: How far back can I view historical data?

**A**: This depends on when your domain was set up and when data backfill was completed:

- **Typical range**: 90 days or more of historical data
- **New domains**: May have limited history initially
- **Backfilled data**: System administrators run backfill jobs to populate historical milestones

To see all available history, try setting the date range to the earliest possible date and see what data appears.

**Limitation**: You can only view 90 days at a time, but you can change the date range to view older periods.

---

### Q5: Can I access the dashboard on mobile devices?

**A**: Yes, the dashboard works on tablets and smartphones, but the experience is optimized for desktop browsers.

**Recommendations**:
- **Desktop/Laptop**: Best experience, all features fully functional
- **Tablet**: Good experience, charts may be smaller
- **Smartphone**: Works but cramped, better for quick checks than deep analysis

For detailed analysis and exports, we recommend using a desktop or laptop computer.

---

## Access and Permissions

### Q6: Why do I get an "Access Denied" error?

**A**: This happens for three main reasons:

1. **You don't have domain_admin role** - Contact your system administrator to request access
2. **Feature not enabled yet** - The Funnel Dashboard is rolling out in phases and may not be available for your organization yet
3. **Session expired** - Try logging out and logging back in

**To check your role**: Go to your profile/account settings and look for "Role" or "Permissions" - it should show "Domain Administrator" or "Admin".

---

### Q7: Can I share my dashboard access with team members?

**A**: You can't directly share access, but your system administrator can grant domain_admin role to other team members. Here's how to request this:

1. Identify who on your team needs access
2. Contact your system administrator
3. Ask them to grant domain_admin role to those team members
4. Once granted, they'll be able to access the dashboard independently

**Note**: Each person needs their own login - you can't share a single account.

---

### Q8: What's the difference between domain_admin and system admin access?

**A**:

| Feature | Domain Admin | System Admin |
|---------|--------------|--------------|
| See own domain's data | ✅ Yes | ✅ Yes |
| See other domains' data | ❌ No | ✅ Yes |
| Export data | ✅ Yes (own domain) | ✅ Yes (all domains) |
| See individual user IDs in exports | ❌ No | ⚠️ With elevated flag only |
| Access raw event details | ❌ Limited | ✅ Yes |
| Configure dashboard settings | ❌ No | ✅ Yes |

**Security Note**: This separation ensures domain admins can only see data they're authorized to view.

---

### Q9: I have domain_admin role but still can't see the dashboard. Why?

**A**: The most likely reasons:

1. **Feature flag not enabled**: The Funnel Dashboard may not be rolled out to your organization yet. Check with your system administrator about rollout status.

2. **Rollout phase restriction**: During Phase 1 (Internal phase), only system admins can access it. Domain admins get access in Phase 2. Ask your admin which phase your organization is in.

3. **Domain configuration issue**: Your domain may not be properly configured in the system. Contact your system administrator.

4. **Browser cache**: Clear your browser cache and cookies, then log out and log back in.

---

### Q10: Can I grant dashboard access to external stakeholders (clients, partners)?

**A**: No, for security reasons. The Funnel Dashboard is only for internal users (employees) with domain_admin or admin roles.

**Alternative solutions**:
1. **Export data and share reports**: Export CSV files and create reports in Excel/PowerPoint to share externally
2. **Screenshots**: Take screenshots of key metrics to include in presentations
3. **Summary documents**: Create written summaries of insights for external stakeholders

Never share your login credentials with anyone, including external partners.

---

## Understanding Data

### Q11: What's the difference between "Total" and "Unique Users"?

**A**:

**Total**: Counts every single event, including duplicates
- Example: If the same user signs up 3 times (maybe they created multiple accounts), that counts as 3 events

**Unique Users**: Counts each person only once, no matter how many times they did that action
- Example: Same user with 3 signups counts as 1 unique user

**Why both matter**:
- **Total** shows overall volume and activity level
- **Unique Users** shows how many actual people are involved

**Visual Example**:
```
User A signs up 1 time
User B signs up 2 times
User C signs up 1 time

Total Signups: 4
Unique Users: 3
```

---

### Q12: Why don't the numbers add up across different stages?

**A**: This is normal and expected - it's the whole point of a funnel. Fewer users complete each subsequent stage.

**Example**:
```
Signups: 100 users
Email Verified: 80 users (20 didn't verify)
First Conversation: 50 users (30 verified but didn't engage)
Purchase: 5 users (45 engaged but didn't buy)
```

This is called **funnel drop-off**, and it shows you where users are leaving so you can improve those areas.

**If numbers seem off**: Check that you're using the same date range and filters for all metrics you're comparing.

---

### Q13: What does "rangeClamped" or "Date range adjusted" mean?

**A**: This warning appears when you try to select a date range longer than 90 days. The system automatically adjusts it to show the most recent 90 days.

**Why this limit exists**:
- Keeps queries fast (large date ranges take longer)
- Prevents system overload
- 90 days is enough for most analysis needs

**To see older data**: Change your date range to start earlier. You can view any 90-day window in your historical data.

**Example**:
- ❌ Can't view: January 1 - June 1 (151 days)
- ✅ Can view: January 1 - March 31 (90 days)
- ✅ Can view: March 1 - May 30 (90 days)

---

### Q14: What are "milestone events"?

**A**: Milestones are important actions users take that indicate progress through your funnel. The dashboard tracks these core milestones:

**Acquisition Stage**:
- `signup_completed` - User created an account
- `email_verified` - User confirmed their email

**Activation Stage**:
- `first_conversation` - User initiated their first chat
- `first_llm_request` - User sent their first AI request

**Usage Stage**:
- `first_media_generation` - User created first image/video with AI

**Revenue Stage**:
- `purchase_completed` - User made a one-time purchase
- `subscription_started` - User started a recurring subscription

**Note**: These are "first-time" events - they only count the first time a user does each action.

---

### Q15: Why might my metrics show zero or very low numbers?

**A**: Several possible reasons:

1. **New domain**: If your domain was just created, you may not have enough users yet

2. **Date range too narrow**: Try expanding from "Last 7 Days" to "Last 30 Days"

3. **Feature not used**: Some metrics (like "First Media Generation") require users to use that specific feature

4. **Backfill not complete**: Historical data may still be processing - check with your system administrator

5. **Filtering**: Make sure stage filter is set to "All Stages" and you're not accidentally filtering out data

6. **Seasonal variation**: Some businesses naturally have slow periods (holidays, summer, etc.)

---

### Q16: What does the percentage change indicator mean?

**A**: The percentage (like "+15%" or "-8%") shows how your current period compares to the previous period of the same length.

**Examples**:

**This Month view showing "+20%"**:
- This month: 120 signups
- Last month: 100 signups
- Change: +20 signups = +20%

**Last 7 Days view showing "-10%"**:
- Last 7 days: 45 signups
- Previous 7 days: 50 signups
- Change: -5 signups = -10%

**Color coding**:
- 🟢 Green = Positive change (usually good)
- 🔴 Red = Negative change (usually needs attention)
- ⚪ Gray or "-" = No comparison data available

---

## Using the Dashboard

### Q17: What's the best date range to use for regular monitoring?

**A**: It depends on your goals:

**For daily monitoring**:
- **Last 7 Days** - Quick check on recent trends
- Update daily, look for sudden spikes or drops

**For weekly reports**:
- **Last 30 Days** - Good balance of detail and context
- Review every Monday to see full-week trends

**For monthly business reviews**:
- **Last Month** or **Last 90 Days** - See broader patterns
- Best for executive reports and strategy planning

**For campaign analysis**:
- **Custom Range** - Match your campaign start/end dates exactly
- Best for measuring specific initiatives

**Pro Tip**: Use the same date range consistently (e.g., always check "Last 30 Days" on Mondays) so you can spot patterns over time.

---

### Q18: Should I use auto-refresh or not?

**A**:

**Enable auto-refresh when**:
- ✅ Monitoring a live event (product launch, marketing campaign)
- ✅ Watching metrics during business hours
- ✅ Presenting live data in a meeting
- ✅ You want to see new data as it arrives

**Disable auto-refresh when**:
- ✅ Doing detailed analysis (prevents numbers from changing while you work)
- ✅ Taking screenshots or creating reports
- ✅ Comparing specific numbers that need to stay stable
- ✅ Dashboard is open in a background tab (saves resources)

**Note**: Auto-refresh updates every 30 seconds, which uses bandwidth and may slow down other tabs slightly.

---

### Q19: How do I compare this month vs last month?

**A**: Follow these steps:

**Method 1: Quick visual comparison**
1. Set date range to "This Month"
2. Look at the percentage change indicators on each metric
3. Green (+) = This month is better, Red (-) = This month is worse

**Method 2: Detailed comparison**
1. Set date range to "This Month", note all key numbers
2. Change date range to "Last Month", note all key numbers
3. Calculate: (This Month - Last Month) / Last Month × 100

**Method 3: Export and analyze**
1. Export "This Month" data as CSV
2. Export "Last Month" data as CSV
3. Open both in Excel
4. Create a comparison table or chart

**Example comparison table**:
```
Metric          | This Month | Last Month | Change
----------------|------------|------------|--------
Signups         | 150        | 120        | +25%
Email Verified  | 110        | 95         | +16%
First LLM       | 75         | 70         | +7%
Purchases       | 8          | 5          | +60%
```

See [Task 5 in User Guide](./funnel-dashboard-domain-admin.md#task-5-compare-different-time-periods) for detailed instructions.

---

### Q20: Which tab should I focus on?

**A**: It depends on your role and current priorities:

**Marketing professionals** → **Acquisition Tab**
- Track signup growth
- Measure campaign effectiveness
- Monitor email verification rates

**Product managers** → **Activation Tab**
- See if onboarding is working
- Track feature adoption
- Identify engagement gaps

**Sales/Revenue teams** → **Revenue Tab**
- Monitor purchase conversions
- Track subscription signups
- Calculate revenue metrics

**Executives** → **Overview Tab**
- High-level summary of all stages
- Quick health check
- Spot major trends fast

**Data analysts** → **All tabs + Export**
- Deep dive into each stage
- Export data for custom analysis
- Look for correlations between stages

**Start with Overview**: If you're new, always start with the Overview tab to get the big picture, then dive into specific tabs based on what catches your attention.

---

## Exporting Data

### Q21: What format should I export - CSV or JSON?

**A**:

**Choose CSV if**:
- ✅ You'll open it in Excel or Google Sheets
- ✅ You're creating reports for non-technical audiences
- ✅ You need to make charts and pivot tables
- ✅ You're most comfortable with spreadsheets
- **Recommended for 95% of users**

**Choose JSON if**:
- ✅ You're importing into another software system
- ✅ You're a developer integrating with other tools
- ✅ You need to preserve exact data types and structure
- ✅ You're automating data processing with scripts

**When in doubt, choose CSV** - it's easier to work with for most business use cases.

---

### Q22: Why is my export limited to 5,000 rows?

**A**: The 5,000-row limit exists for several important reasons:

1. **Performance**: Large exports can slow down the system for everyone
2. **Browser limits**: Very large files can crash browsers when downloading
3. **Data protection**: Limits risk of bulk data exfiltration
4. **Practical use**: Most analysis doesn't need more than 5,000 rows

**If you need more data**:

**Option 1: Break into smaller ranges**
- Instead of exporting 90 days, export three separate 30-day periods
- Combine the CSV files in Excel

**Option 2: Use filters**
- Export Acquisition stage separately from Revenue stage
- Each filtered export has its own 5,000-row limit

**Option 3: Contact support**
- For legitimate business needs requiring bulk exports
- They can arrange special exports or adjust limits

**Option 4: Use aggregation**
- Instead of raw events, export time-bucketed summaries (day/week/month)
- Summaries are much smaller and usually sufficient

---

### Q23: How many times can I export data?

**A**: You can export **10 times per minute**. After 10 exports in 60 seconds, you'll need to wait before exporting again.

**Why this limit exists**: Prevents system overload and protects against data scraping.

**Tips to avoid hitting the limit**:
- Plan your exports - decide what you need before clicking Export repeatedly
- Use broader date ranges or filters to get more data in one export
- Wait a full minute if you hit the limit (it resets after 60 seconds)

**Normal usage never hits this limit**: Most users export 1-3 times per session, far below the limit.

---

### Q24: Can I schedule automatic exports?

**A**: No, the dashboard doesn't currently support automated/scheduled exports. You need to manually export each time.

**Workarounds**:

1. **Set a calendar reminder**: Remind yourself to export weekly/monthly
2. **Create a routine**: Every Monday morning, export last week's data
3. **Request feature**: Ask your system admin to relay the feature request to the product team

**Why not available**: Scheduled exports can leak data if accounts are compromised, so they require additional security features that aren't implemented yet.

---

### Q25: What if I accidentally export the wrong date range?

**A**: No problem - just export again with the correct date range.

**The export doesn't lock or change anything** - it just creates a copy of the data. You can export the same data multiple times without any issues.

**If you already opened the file**: Just delete it and export again. There's no "undo" needed because the original data in the dashboard is unchanged.

---

## Data Privacy and Security

### Q26: Can I see individual user names or email addresses in the dashboard?

**A**: **No**, for privacy and security reasons:

- **Dashboard view**: Shows only aggregated numbers, no individual user info
- **Standard exports**: Exclude user IDs and personal information by default
- **Elevated exports**: System admins can access user IDs with special permission flag (domain admins cannot)

**What you CAN see**:
- Total counts (e.g., "150 signups")
- Unique user counts (e.g., "145 unique users")
- Aggregated behavior patterns
- Time-based trends

**What you CANNOT see**:
- User names
- Email addresses
- IP addresses
- Phone numbers
- Exact user IDs (unless you're a system admin with elevated permission)

**Why**: This protects user privacy and complies with data protection regulations (GDPR, CCPA, etc.).

---

### Q27: Is my exported data secure?

**A**: The data in your exports is **anonymized and aggregated** by default, making it relatively safe, but you still need to handle it carefully:

**Security best practices**:
- ✅ Store exports in secure, company-approved locations (Google Drive, OneDrive with access controls)
- ✅ Don't email exports to external parties
- ✅ Delete old exports when no longer needed
- ✅ Use password-protected ZIP files if sharing sensitive analysis
- ❌ Don't save exports to public folders or personal devices
- ❌ Don't upload to unauthorized cloud services

**What's in exports**: Event counts, timestamps, aggregated metrics - no passwords, credit cards, or personally identifiable information (PII).

**Compliance**: Exports are designed to meet GDPR, CCPA, and other data privacy regulations by excluding personal data.

---

### Q28: Who can see what I view in the dashboard?

**A**: Your viewing activity is **private** - other users can't see what you're looking at in the dashboard.

**However**:
- **Audit logs exist**: System administrators can see that you accessed the dashboard (timestamp, which tab) in security audit logs
- **Exports are logged**: When you export data, it's logged (who, when, what date range) for compliance
- **Normal operations**: These logs are only reviewed during security audits or investigations

**Privacy note**: This logging is for security and compliance, not surveillance. It helps detect unauthorized access or data breaches.

---

### Q29: Can I share screenshots of the dashboard publicly (social media, blog)?

**A**: **Be very careful**:

**Never share if screenshots contain**:
- ❌ Company names or domain names
- ❌ Specific revenue numbers (confidential business data)
- ❌ Any user information
- ❌ URL bar showing your company's domain

**Okay to share if**:
- ✅ You blur out company identifiers
- ✅ You have approval from your manager/legal team
- ✅ Numbers are changed to hypothetical examples
- ✅ Purpose is educational (showing how the feature works, not real data)

**When in doubt**: Ask your manager or communications team before sharing anything publicly. Confidential business data can give competitors an advantage.

---

### Q30: What happens to my data if I leave the company?

**A**: When your account is deactivated:

1. **Dashboard access**: Removed immediately
2. **Historical data**: Remains in the system (it's company data, not personal data)
3. **Exports you created**: Remain in wherever you saved them (company drive, etc.)
4. **Audit logs**: Retained for compliance (shows you accessed the dashboard while employed)

**Before leaving**: Don't delete or take company exports with you. They belong to the company.

---

## Troubleshooting

### Q31: Dashboard is loading slowly. What can I do?

**A**: Try these solutions in order:

1. **Reduce date range**: Change from "Last 90 Days" to "Last 30 Days" or "Last 7 Days"
2. **Use stage filter**: Filter to one stage instead of viewing all stages at once
3. **Disable auto-refresh**: Reduces server requests
4. **Clear browser cache**: Chrome: Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
5. **Try different browser**: Switch from Chrome to Firefox or vice versa
6. **Check internet speed**: Run speed test at speedtest.net
7. **Try off-peak hours**: Early morning or late evening usually faster

**Still slow?**: Contact your system administrator - there may be a system-wide performance issue.

---

### Q32: I see different numbers when I refresh the page. Is this a bug?

**A**: Probably not a bug - here's why numbers can change:

1. **New data arriving**: Events from the last 5 minutes may have just appeared
2. **Cache updates**: 5-minute cache may have expired and refreshed
3. **Time zone differences**: Midnight in your timezone vs server timezone can shift daily counts
4. **Ongoing activity**: If users are actively signing up/purchasing while you're viewing

**To stabilize numbers**:
- Disable auto-refresh
- Look at completed time periods (e.g., "Last Month" instead of "Today")
- Export data for a frozen snapshot

**When it IS a bug**: If numbers change drastically (e.g., 100 signups becomes 10 signups) or change direction (increase becomes decrease), contact support.

---

### Q33: Export failed with an error. What do I do?

**A**: Common solutions:

**Error: "Rate limit exceeded"**
- Wait 60 seconds, then try again
- You've exceeded 10 exports per minute

**Error: "Date range too large"**
- Reduce your date range to 90 days or less

**Error: "No data available"**
- Check your filters and date range
- Try "Last 90 Days" with no filters

**Error: "Export timeout"**
- Try smaller date range
- Try during off-peak hours
- Use stage filter to reduce data volume

**Error: "Browser blocked download"**
- Check browser popup blocker settings
- Allow downloads from smartaihub.app
- Try different browser

**Still failing?**: Contact support with the exact error message and what you were trying to export.

---

### Q34: Why do I see "No data available" for certain metrics?

**A**: Possible reasons:

1. **Feature not enabled**: That feature may not be available for your domain
   - Example: "Subscription Started" won't show if subscriptions aren't enabled

2. **No users reached that stage**: Users may not have gotten that far in the funnel
   - Example: No purchases yet if product just launched

3. **Date range too narrow**: Try expanding to "Last 90 Days"

4. **Backfill incomplete**: Historical data for that milestone may still be processing

5. **Domain too new**: Newly created domains may not have all milestone types yet

**To investigate**: Start with broad filters ("All Stages", "Last 90 Days") and narrow down.

---

### Q35: Can I recover deleted exports?

**A**: No - once you delete an export file from your computer or cloud storage, it's gone.

**But you can re-export**:
- Go back to the dashboard
- Select the same date range and filters
- Export again
- You'll get the same data (unless new events arrived since original export)

**Tip**: Don't delete exports immediately. Store them in a "Dashboard Exports" folder with dated filenames like `funnel-export-2026-02-15.csv` so you can reference them later.

---

## Advanced Topics

### Q36: What's the difference between cached and non-cached data?

**A**:

**Cached data**:
- Stored temporarily (5 minutes) for faster loading
- You'll see a "Cached" indicator or timestamp showing when it was generated
- Slightly less current, but loads much faster
- Good enough for 95% of use cases

**Non-cached (fresh) data**:
- Queried directly from the database
- Always current (within 5 minutes of events happening)
- Takes longer to load
- Available by clicking "Refresh" or "Clear Cache" button

**When to force fresh data**:
- You need exact up-to-the-minute numbers
- You just ran a marketing campaign and want to see immediate impact
- Presenting live data in a meeting

**When cached is fine**:
- Regular daily/weekly check-ins
- Historical analysis (old data doesn't change)
- Comparative trend analysis

---

### Q37: Can I integrate dashboard data with other tools (BI, CRM)?

**A**: Not directly through API, but you can use exports:

**Current method**:
1. Export data as CSV or JSON
2. Import into your other tool (Excel, Google Sheets, Tableau, Power BI)
3. Create custom dashboards or reports in that tool

**For automated integration**: Contact your system administrator to inquire about API access (may require custom development or enterprise plan).

**Popular integrations users have built**:
- Excel pivot tables with weekly exports
- Google Sheets with imported CSVs for real-time dashboards
- Power BI connecting to exported data folders

---

### Q38: How are dates and times handled in the dashboard?

**A**:

**Time zones**:
- Dashboard shows times in **your local time zone** (based on browser settings)
- Backend stores everything in **UTC**
- Exports include timestamps in **ISO 8601 format** (e.g., `2026-02-15T14:23:00Z`)

**Day boundaries**:
- "Today" = midnight to midnight in your local time zone
- "This Month" = 1st to last day of month in your local time zone

**Important for global teams**: If your team is in different time zones, you might see slightly different numbers for "Today" or "This Week". Use completed periods ("Last Month") for consistency.

---

### Q39: What's "reconciliation drift" and why does it matter?

**A**: Reconciliation drift measures how well the funnel analytics data matches the original source data.

**Simple explanation**:
- Source data: User signups recorded in main database
- Funnel data: User signups recorded in analytics funnel
- Drift: Difference between these two numbers

**Acceptable drift**: Less than 5%
**Example**:
- Main database: 1,000 signups
- Funnel analytics: 980 signups
- Drift: 2% (acceptable)

**Why you might see drift**:
- Timing differences (events haven't fully synced yet)
- Deduplication (funnel removes duplicates)
- Backfill in progress

**What to do**: If drift seems high (>10%), contact your system administrator to investigate.

**Note**: This is a technical metric usually only visible to system admins, but it's good to understand if you see "data quality warnings".

---

### Q40: How do I calculate conversion rates between stages?

**A**: Use this simple formula:

**Conversion Rate = (Users at Next Stage / Users at Previous Stage) × 100**

**Example calculations**:

**Signup to Email Verification**:
- Signups: 200 users
- Email Verified: 150 users
- Conversion Rate: (150 / 200) × 100 = **75%**

**Email Verification to First Conversation**:
- Email Verified: 150 users
- First Conversation: 90 users
- Conversion Rate: (90 / 150) × 100 = **60%**

**Signup to Purchase (end-to-end)**:
- Signups: 200 users
- Purchases: 10 users
- Conversion Rate: (10 / 200) × 100 = **5%**

**Tip**: Export data to Excel and create a conversion rate column:
```
=B2/B1*100
```
Where B2 is next stage, B1 is previous stage.

**Benchmarks** (varies by industry):
- Email verification: 70-90% is good
- Signup to activation: 30-50% is typical
- Signup to purchase: 2-10% is normal for freemium products

---

## Still Have Questions?

If your question isn't answered here:

1. **Check the User Guide**: [Funnel Dashboard User Guide](./funnel-dashboard-domain-admin.md) has detailed walkthroughs
2. **Contact your System Administrator**: They can help with access, permissions, and technical issues
3. **Submit feedback**: Ask your admin to relay feature requests or documentation improvements to the product team

---

## Document Information

**Version**: 1.0
**Last Updated**: February 17, 2026
**Maintained By**: Product Team
**Feedback**: Send suggestions via your system administrator

**Related Documentation**:
- [Funnel Dashboard User Guide](./funnel-dashboard-domain-admin.md) - Complete step-by-step guide
- [Admin Operations Runbook](../runbooks/funnel-dashboard-rollout.md) - For system administrators (technical)

# Funnel Dashboard User Guide for Domain Administrators

**Last Updated**: February 17, 2026
**Version**: 1.0
**Target Audience**: Domain Administrators (non-technical users)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Understanding Your Metrics](#understanding-your-metrics)
4. [Using the Dashboard](#using-the-dashboard)
5. [Exporting Data](#exporting-data)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Frequently Asked Questions](#frequently-asked-questions)

---

## Introduction

### What is the Funnel Dashboard?

The Funnel Dashboard is your analytics tool for understanding how users interact with your platform. It tracks the customer journey from their first visit through becoming paying customers, helping you answer important questions like:

- How many new users signed up this month?
- Are users activating their accounts after registration?
- Which features are users actually using?
- How many users are making purchases?

Think of it as your business intelligence dashboard - a single place to see what's working and what needs improvement.

### What You Can Do

With the Funnel Dashboard, you can:

- **View key metrics** about user acquisition, activation, usage, and revenue
- **Track trends over time** to see if your numbers are improving
- **Export data** for deeper analysis in Excel or Google Sheets
- **Make data-driven decisions** about your product and marketing strategies

### Access Requirements

To access the Funnel Dashboard, you need:

- Domain Administrator role (your system admin can grant this)
- Access to the Admin section of SmartSpecPro
- Feature must be enabled by your system administrator (currently rolling out in phases)

---

## Getting Started

### Accessing the Dashboard

Follow these simple steps to open the Funnel Dashboard:

1. **Log in** to SmartSpecPro at https://smartaihub.app
2. Navigate to the **Admin** section (look for the Admin menu in the top navigation or sidebar)
3. Click on the **"Funnel Analytics"** tab or menu item
4. The dashboard will load showing your latest metrics

[Screenshot: Admin menu with Funnel Analytics highlighted]

### First Look at Your Dashboard

When you first open the dashboard, you'll see:

- **Overview Tab**: Summary cards showing your most important numbers
- **Date Range Selector**: Choose which time period you want to view
- **Tab Navigation**: Switch between different views (Acquisition, Activation, Revenue, etc.)
- **Auto-Refresh Toggle**: Keep your data up-to-date automatically

[Screenshot: Dashboard overview with labeled sections]

**Important Note**: You can only see data for your own domain. If your organization has multiple domains, each domain admin sees only their own domain's data. System admins can see data across all domains.

---

## Understanding Your Metrics

This section explains what each number means in plain language.

### Acquisition Metrics (Getting New Users)

These metrics track how many people are discovering and signing up for your service.

#### Signup Completed
**What it means**: The number of users who successfully created an account.

**Why it matters**: This is your top-of-funnel metric. If signups are low, you may need to improve marketing or make registration easier.

**Example**: "150 signups this month" means 150 new accounts were created.

#### Email Verified
**What it means**: How many users confirmed their email address after signing up.

**Why it matters**: Verified users are more likely to be real, engaged users (not bots or fake accounts). Low verification rates might mean your confirmation email isn't reaching users or isn't clear.

**Example**: If you have 150 signups but only 100 email verifications, that's a 67% verification rate.

### Activation Metrics (Getting Users Started)

These metrics show whether new users are actually trying your product.

#### First Conversation
**What it means**: Users who initiated their first chat or conversation in the system.

**Why it matters**: This shows users are engaging with core features. If this number is low compared to signups, your onboarding might need improvement.

#### First LLM Request
**What it means**: Users who sent their first AI/LLM request (like asking a question to an AI model).

**Why it matters**: This is deeper engagement - users are actively using AI features, which is likely why they signed up.

### Usage Metrics (Regular Activity)

These metrics track ongoing use of your product.

#### First Media Generation
**What it means**: Users who generated their first image or video using AI.

**Why it matters**: Media generation is often a premium feature. Users reaching this milestone are exploring advanced capabilities.

### Revenue Metrics (Making Money)

These are the numbers that directly affect your bottom line.

#### Purchase Completed
**What it means**: Users who made a one-time purchase (like buying credits or a single feature).

**Why it matters**: Direct revenue. Track this to understand pricing effectiveness and feature value.

#### Subscription Started
**What it means**: Users who started a recurring subscription plan.

**Why it matters**: Recurring revenue is more predictable and valuable than one-time purchases. This metric shows long-term customer commitment.

### Understanding Unique Users

Throughout the dashboard, you'll see two numbers for most metrics:

- **Total Events**: How many times this action happened
- **Unique Users**: How many different people performed this action

**Example**: If you see "200 signups (195 unique users)", it means 200 signup events occurred, but 5 users might have created multiple accounts or there were duplicate entries.

---

## Using the Dashboard

### Selecting a Date Range

The date range selector lets you choose which time period to analyze.

**Steps**:
1. Click the **date selector** at the top of the dashboard
2. Choose a preset range:
   - Last 7 Days
   - Last 30 Days
   - Last 90 Days
   - This Month
   - Last Month
   - Custom Range
3. For custom ranges, click the start date and end date in the calendar
4. Click **Apply** to update the dashboard

[Screenshot: Date range selector with options]

**Important Limits**:
- Maximum date range: **90 days** at a time
- If you try to select a longer range, it will automatically adjust to the most recent 90 days
- Older data is still available - just choose an earlier date range

### Navigating Between Tabs

The dashboard has multiple tabs for different aspects of your funnel:

#### Overview Tab
**What you see**: Summary cards with your most important metrics across all stages.

**Best for**: Quick daily check-ins, executive summaries, spotting major trends.

[Screenshot: Overview tab]

#### Acquisition Tab
**What you see**: Detailed signup and email verification data with charts over time.

**Best for**: Evaluating marketing campaigns, tracking growth rate.

#### Activation Tab
**What you see**: How users are engaging with core features after signing up.

**Best for**: Understanding onboarding effectiveness, identifying drop-off points.

#### Revenue Tab
**What you see**: Purchase and subscription metrics with revenue trends.

**Best for**: Financial planning, pricing strategy evaluation, conversion analysis.

### Using Auto-Refresh

The auto-refresh feature keeps your data current without manually reloading.

**How to use**:
1. Look for the **Auto-Refresh toggle** (usually near the date selector)
2. Click to **enable** auto-refresh
3. Dashboard will update every **30 seconds** automatically
4. Click again to **disable** if you want to freeze the current view

**When to use auto-refresh**:
- ✅ Monitoring a live campaign launch
- ✅ Watching metrics during business hours
- ✅ Presenting live data in meetings

**When to disable**:
- ✅ Doing detailed analysis (prevents view from changing)
- ✅ Comparing specific numbers (keeps them stable)
- ✅ Taking screenshots or creating reports

### Understanding the Charts

The dashboard uses several types of visualizations:

#### Line Charts (Time Series)
**What they show**: How a metric changes over time.

**How to read**:
- X-axis (horizontal): Time (days, weeks, or months)
- Y-axis (vertical): Number of events or users
- Upward trend = growing, downward trend = declining

[Screenshot: Line chart example]

#### Bar Charts (Comparisons)
**What they show**: Compare different metrics or time periods side-by-side.

**How to read**: Taller bars = higher values. Compare bar heights to see which metrics are strongest.

[Screenshot: Bar chart example]

#### Summary Cards (KPIs)
**What they show**: Single number with a brief description, sometimes with a percentage change.

**How to read**:
- Large number: Current value
- Small percentage: Change from previous period (green = up, red = down)
- Arrow: Direction of change

[Screenshot: Summary card example]

### Filtering by Stage

If you want to focus on one part of the funnel, use the stage filter:

**Steps**:
1. Find the **Stage Filter** dropdown (usually near the date range selector)
2. Choose a stage:
   - **All Stages**: See everything (default)
   - **Acquisition**: Only signup-related metrics
   - **Activation**: Only feature engagement metrics
   - **Usage**: Only ongoing usage metrics
   - **Revenue**: Only purchase and subscription metrics
3. Dashboard updates to show only that stage's data

**Tip**: Use this when you want to focus on improving one specific area, like increasing email verifications (Acquisition) or boosting subscription signups (Revenue).

---

## Exporting Data

Sometimes you need to analyze data in Excel, Google Sheets, or share with others. The export feature makes this easy.

### How to Export

**Step-by-step**:

1. **Navigate to the Export tab** in the dashboard (or find the Export button)
2. **Choose your date range** using the date selector
3. **Select a stage filter** (optional - choose "All Stages" to get everything)
4. **Pick a format**:
   - **CSV**: Best for Excel, Google Sheets, and data analysis tools
   - **JSON**: Best for technical users or importing into other software
5. **Click the Export button**
6. **Wait a moment** while the file is prepared (usually 2-5 seconds)
7. **Download** will start automatically

[Screenshot: Export interface with options]

### Understanding Export Limits

To keep the system fast and protect your data, exports have some limits:

- **Maximum rows**: 5,000 rows per export
- **Rate limit**: 10 exports per minute
- **Date range**: Same as dashboard (90 days maximum)

**What if you have more than 5,000 rows?**

If your data exceeds 5,000 rows, the export will include the most recent 5,000 entries and show a warning. To get all your data:

1. **Break into smaller date ranges**: Export 30 days at a time instead of 90
2. **Use stage filters**: Export Acquisition data separately from Revenue data
3. **Contact support**: For bulk exports beyond normal limits

### Working with Exported Data

#### Opening CSV Files

**In Excel**:
1. Open Excel
2. Go to File → Open
3. Select your downloaded CSV file
4. Click "Open" and Excel will format it automatically

**In Google Sheets**:
1. Go to Google Sheets
2. File → Import
3. Upload your CSV file
4. Choose "Comma" as separator
5. Click "Import data"

[Screenshot: CSV opened in Excel]

#### Understanding the Columns

Your exported CSV will have these columns:

| Column Name | Description | Example Value |
|-------------|-------------|---------------|
| `eventName` | Type of milestone | `signup_completed` |
| `eventTime` | When it happened | `2026-02-15 14:23:00` |
| `domain` | Which domain (if applicable) | `example.com` |
| `total` | Count of events | `47` |
| `uniqueUsers` | Count of unique users | `45` |

**Privacy Note**: User IDs and personal information are excluded from exports by default to protect privacy. Only aggregated numbers and anonymized data are included.

### Export Best Practices

**For Monthly Reports**:
1. Set date range to "Last Month"
2. Export as CSV
3. Open in Excel
4. Create pivot tables or charts for your report

**For Trend Analysis**:
1. Export multiple consecutive months separately
2. Combine CSV files in Excel (copy/paste)
3. Create a line chart showing trends over time

**For Sharing with Team**:
1. Export as CSV
2. Save to shared drive (Google Drive, OneDrive, etc.)
3. Share link with team members

---

## Common Tasks

This section provides step-by-step instructions for tasks you'll do frequently.

### Task 1: Check This Month's Growth

**Goal**: See how many new users you got this month compared to last month.

**Steps**:
1. Open the Funnel Dashboard
2. Set date range to **"This Month"**
3. Go to the **Acquisition** tab
4. Look at the **Signup Completed** card
5. Note the number and the percentage change
6. If the percentage is green and positive (e.g., "+15%"), you're growing
7. If it's red and negative (e.g., "-8%"), signups are down

**What to do next**:
- If growing: Great! Look at which marketing channels are working
- If declining: Review recent changes, check marketing campaigns, consider A/B testing signup flow

---

### Task 2: Identify Where Users Drop Off

**Goal**: Find which step in your funnel loses the most users.

**Steps**:
1. Go to the **Overview** tab
2. Look at metrics in order:
   - Signup Completed: 200 users
   - Email Verified: 150 users (75% of signups)
   - First Conversation: 90 users (45% of signups)
   - First LLM Request: 80 users (40% of signups)
   - Purchase Completed: 10 users (5% of signups)

3. **Calculate drop-off percentages**:
   - Signup → Email: 25% drop-off (50 users lost)
   - Email → First Conversation: 40% drop-off (60 users lost) ← **Biggest drop**
   - Conversation → LLM Request: 11% drop-off (10 users lost)
   - LLM → Purchase: 87.5% drop-off (70 users lost)

4. **Identify the problem area**: In this example, the biggest drop is between email verification and first conversation.

**What to do next**:
- **If drop-off is at email verification**: Improve confirmation emails, check spam folders
- **If drop-off is at first conversation**: Improve onboarding, add tutorials, simplify UI
- **If drop-off is at purchase**: Review pricing, add trials, highlight value proposition

---

### Task 3: Track Campaign Performance

**Goal**: See if your marketing campaign increased signups.

**Steps**:
1. Note when your campaign launched (e.g., February 1)
2. Open the Funnel Dashboard
3. Set date range to **"Last 30 Days"**
4. Go to the **Acquisition** tab
5. Look at the **time series chart** (line graph)
6. Find the date your campaign launched on the X-axis
7. Check if there's a visible spike or upward trend after that date

[Screenshot: Time series showing campaign impact]

**What to look for**:
- **Immediate spike**: Campaign drove immediate awareness
- **Gradual increase**: Campaign is building momentum over time
- **No change**: Campaign may need adjustment or more time

**Pro Tip**: Export the data as CSV to calculate exact before/after numbers:
- Average signups per day for 7 days BEFORE campaign
- Average signups per day for 7 days AFTER campaign
- Calculate percentage increase

---

### Task 4: Create a Monthly Executive Report

**Goal**: Prepare a summary for leadership showing overall performance.

**Steps**:

1. **Set date range to "Last Month"**

2. **Capture key numbers** from Overview tab:
   - Total signups
   - Total activations (first conversation)
   - Total purchases
   - Total new subscriptions

3. **Export the data**:
   - Click Export
   - Choose CSV format
   - Download file

4. **Create your report** (in Word, Google Docs, or PowerPoint):
   - **Headline**: "February 2026 Funnel Performance"
   - **Growth**: "15% increase in signups compared to January"
   - **Activation Rate**: "45% of new users had their first conversation"
   - **Revenue**: "$5,400 in new purchases, 12 new subscriptions"
   - **Key Insight**: "Biggest opportunity: improve email verification rate from 75% to 85%"
   - **Attach**: CSV export as supporting data

5. **Include trend charts**: Take screenshots from the dashboard showing time series

---

### Task 5: Compare Different Time Periods

**Goal**: See if your metrics are improving month-over-month or year-over-year.

**Steps**:

1. **For this month vs last month**:
   - Set date range to "This Month"
   - Note the numbers
   - Change date range to "Last Month"
   - Note the numbers
   - Calculate: (This Month - Last Month) / Last Month × 100 = Percentage Change

2. **For detailed comparison**:
   - Export "This Month" data as CSV
   - Export "Last Month" data as CSV
   - Open both in Excel
   - Create a summary table comparing key metrics

**Example Comparison Table**:

| Metric | This Month | Last Month | Change |
|--------|------------|------------|--------|
| Signups | 200 | 180 | +11% |
| Email Verified | 150 | 140 | +7% |
| First Conversation | 90 | 75 | +20% |
| Purchases | 10 | 8 | +25% |

**What to look for**:
- All metrics improving: Business is healthy and growing
- Some improving, some declining: Prioritize fixing declining areas
- All metrics declining: May need strategic changes or seasonal adjustment

---

## Troubleshooting

### Problem: "Access Denied" or "Unauthorized" Error

**Why this happens**: You don't have the correct permissions to view the dashboard.

**Solutions**:
1. **Check your role**: Make sure you have Domain Administrator role (not just regular User)
2. **Contact your system admin**: Ask them to grant you domain_admin permissions
3. **Verify feature is enabled**: The Funnel Dashboard may not be enabled yet (it's rolling out in phases)
4. **Log out and log back in**: Sometimes permissions need a fresh login to take effect

---

### Problem: Dashboard Shows No Data

**Why this happens**: Either there's no data for your selected date range, or you're looking at a new domain.

**Solutions**:
1. **Check the date range**: Try "Last 90 Days" to cast a wider net
2. **Verify your domain has users**: If it's a brand new domain, you may not have events yet
3. **Wait for data to sync**: New events can take up to 5 minutes to appear (try auto-refresh)
4. **Check with system admin**: Data backfill may still be in progress

---

### Problem: Numbers Seem Wrong or Inconsistent

**Why this happens**: Data timing, caching, or filtering might be affecting what you see.

**Solutions**:
1. **Clear cache**: Look for a "Clear Cache" or "Refresh" button on the dashboard
2. **Check your filters**: Make sure stage filter is set to "All Stages" if you want everything
3. **Wait a moment**: If auto-refresh is on, numbers will update within 30 seconds
4. **Compare with exports**: Export data and check if the CSV numbers match what you see
5. **Report inconsistencies**: If numbers are consistently wrong, contact support with specific examples

---

### Problem: Export Button Doesn't Work

**Why this happens**: Rate limiting, browser issues, or temporary system problems.

**Solutions**:
1. **Check rate limit**: Have you exported more than 10 times in the last minute? Wait 60 seconds
2. **Try a different browser**: Sometimes browser extensions block downloads
3. **Check popup blockers**: Disable popup blockers for smartaihub.app
4. **Try smaller date range**: If you're exporting 90 days, try 30 days instead
5. **Contact support**: If problem persists, report it with error message (if any)

---

### Problem: Dashboard Loads Very Slowly

**Why this happens**: Large date ranges, many users, or network issues.

**Solutions**:
1. **Reduce date range**: Try "Last 7 Days" instead of "Last 90 Days"
2. **Use stage filters**: Filter to one stage (e.g., only Acquisition) instead of all stages
3. **Turn off auto-refresh**: This reduces server load
4. **Check your internet connection**: Slow networks affect loading time
5. **Try during off-peak hours**: Early morning or late evening typically faster

---

### Problem: Can't See Certain Metrics

**Why this happens**: Either no users reached that milestone, or you don't have permission.

**Solutions**:
1. **Expand date range**: Maybe no one completed that action in last 7 days, try 30 days
2. **Check feature availability**: Some metrics (like subscriptions) require that feature to be enabled
3. **Verify permissions**: Domain admins can only see their own domain's data
4. **Contact admin**: System admin may have additional metrics you can't see

---

### Problem: Percentage Changes Show "N/A" or "-"

**Why this happens**: There's no previous period data to compare against.

**Solutions**:
1. **Wait for more data**: If domain is new, you need at least 2 comparable periods
2. **This is normal for new domains**: First month has nothing to compare to
3. **Ignore for now**: Focus on absolute numbers until you have historical data

---

## Frequently Asked Questions

For more detailed FAQs, see [Funnel Dashboard FAQ](./funnel-dashboard-faq.md).

**Quick answers to common questions**:

**Q: How often is data updated?**
A: New events appear within 5 minutes. Use auto-refresh to keep dashboard current.

**Q: Can I see individual user details?**
A: No, for privacy reasons. Dashboard shows only aggregated and anonymized data.

**Q: What's the difference between "Total" and "Unique Users"?**
A: Total counts all events; Unique Users counts each person only once, even if they did the action multiple times.

**Q: Can I create custom reports or dashboards?**
A: Not currently. Use the export feature to create custom reports in Excel or Google Sheets.

**Q: How far back does historical data go?**
A: Depends on when your domain was set up and when backfill was run. Typically at least 90 days.

**Q: Why can't I see data from other domains?**
A: Domain admins can only see their own domain's data for security and privacy. System admins can see cross-domain data.

**Q: Is my data secure?**
A: Yes. Data is encrypted, access is role-controlled, and personal information is excluded from exports.

**Q: Can I share dashboard access with my team?**
A: Yes, ask your system admin to grant domain_admin role to your team members.

**Q: What if I find a bug or have a feature request?**
A: Contact your system administrator or product support team with details.

---

## Getting Help

If you need additional assistance:

**For technical issues**:
- Contact your **System Administrator**
- Include: error message (if any), what you were trying to do, date/time it happened

**For understanding metrics**:
- Review this user guide
- Check the [FAQ document](./funnel-dashboard-faq.md)
- Ask your **Product Manager** or **Marketing Lead**

**For feature requests**:
- Contact your **System Administrator** or **Product Team**
- Describe what you need and why it would help your analysis

---

## Appendix: Glossary

**Acquisition**: The stage where users discover and sign up for your product.

**Activation**: The stage where new users start using core features.

**CSV**: Comma-Separated Values - a spreadsheet file format that works with Excel and Google Sheets.

**Domain**: In multi-domain systems, this is your organization's specific space (e.g., company.com).

**Domain Admin**: A user role with permission to view analytics for their specific domain.

**Export**: Downloading data from the dashboard to a file (CSV or JSON).

**Funnel**: The customer journey from awareness to purchase, visualized as a funnel because fewer users reach each subsequent stage.

**KPI**: Key Performance Indicator - an important metric you track regularly.

**Milestone**: A significant user action (e.g., first signup, first purchase).

**Unique Users**: Count of individual people, excluding duplicates.

**Revenue**: Income generated from purchases and subscriptions.

**Stage Filter**: Dropdown to show only one part of the funnel (Acquisition, Activation, Usage, or Revenue).

**Time Series**: Chart showing how metrics change over time (line graph).

---

**Document Version**: 1.0
**Last Updated**: February 17, 2026
**Feedback**: Send suggestions to your system administrator

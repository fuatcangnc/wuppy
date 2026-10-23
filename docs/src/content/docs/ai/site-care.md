---
title: Site care
description: Scheduled health and security checks, client reports and bulk updates.
sidebar:
  order: 2
---

## Security scan

**Sites → Run security scan** checks a site from the outside, the way a visitor would. It never sends the site's
token. It reports:

- whether the site is reachable and the hub token is about to expire,
- an unfinished setup page,
- private files that are publicly readable (`.env`, `.git/config`, the auth database, the config file),
- missing security headers: HSTS, `nosniff`, framing protection, referrer policy.

Each finding has a severity: high, medium or low.

## Hourly checks

The hub checks every connected site every hour: the connection, the token and the security scan. When a site has a
new problem of medium or high severity, every user who manages sites gets one email. You are not emailed again
until the problems change.

## Client report

Pick a month and click **Open report (PDF)**. The report shows content counts, the changes made that month, the
security scan and the site status. Use **Save as PDF** on the page (your browser's print dialog) to keep a PDF.

The **Client reporter** agent can write a friendlier summary from the same data and email it.

## Monthly email

Under **Email the report every month to**, choose one of the site's members. On the 1st of each month the hub
sends them the report for the previous month, once. Choose **Nobody** to turn it off.

## Bulk actions

At the top of **Sites**:

- **Check all** checks every connection.
- **Scan all** runs the security scan on every site and shows the results together.
- **Plugin updates** finds plugins with a newer version on every site and updates them one by one or all at once.
  An updated plugin stays off until someone approves it on that site.

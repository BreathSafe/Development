Role-based page entry points

Top-level role routes
- `roles/public/index.html` -> public dashboard (`index.html`)
- `roles/management/index.html` -> management dashboard (`management.html#section=dashboard`)
- `roles/admin/index.html` -> admin dashboard (`admin.html#section=overview`)

Admin section routes
- `roles/admin/overview.html`
- `roles/admin/devices.html`
- `roles/admin/alerts.html`
- `roles/admin/reports.html`
- `roles/admin/users.html`
- `roles/admin/settings.html`

Management section routes
- `roles/management/dashboard.html`
- `roles/management/devices.html`
- `roles/management/map.html`
- `roles/management/analytics.html`
- `roles/management/alerts.html`

Why this structure:
- Each role and section has a dedicated URL for debugging.
- Navigation can be tested per section without manually clicking through the app.
- Keeps compatibility with existing `admin.html`, `management.html`, and `index.html`.

const NAV_CONFIG = [
  { section: 'System', roles: ['admin', 'management'] },
  { id: 'overview', title: 'System Overview', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', adminHref: 'overview.html', mgmtHref: '#overview', roles: ['admin', 'management'] },
  { section: 'Devices', roles: ['admin', 'management'] },
  { id: 'devices', title: 'Device Management', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>', adminHref: 'devices.html', mgmtHref: '#devices', roles: ['admin', 'management'] },
  { id: 'map', title: 'Device Map', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>', mgmtHref: '#map', roles: ['management'] },
  { id: 'alerts', title: 'System Alerts', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>', adminHref: 'alerts.html', mgmtHref: '#alerts', roles: ['admin', 'management'] },
  { id: 'reports', title: 'Analytics & Reports', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>', adminHref: 'reports.html', mgmtHref: '#analytics', roles: ['admin', 'management'] },
  { section: 'Administration', roles: ['admin'] },
  { id: 'users', title: 'User Accounts', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', adminHref: 'users.html', roles: ['admin'] },
  { section: 'Settings', roles: ['admin'] },
  { id: 'settings', title: 'System Config', icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', adminHref: 'settings.html', roles: ['admin'] }
];

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const role = window.location.pathname.includes('/roles/admin/') ? 'admin' : 'management';
  const pageId = document.body.dataset.page || 'overview';
  
  let navHtml = '';
  NAV_CONFIG.forEach(item => {
    if (!item.roles.includes(role)) return;
    
    if (item.section) {
      navHtml += `<div class="nav-section">${item.section}</div>`;
    } else {
      let isActive = false;
      if (role === 'admin') {
        isActive = pageId === item.id;
      } else {
        const hash = window.location.hash.replace('#', '') || 'overview';
        const itemHash = item.mgmtHref.replace('#', '');
        isActive = hash === itemHash;
      }
      
      const activeClass = isActive ? ' active' : '';
      let badgeHtml = '';
      if (item.id === 'alerts') badgeHtml = `<span class="nav-badge" id="${role === 'admin' ? 'alert-nav-badge' : 'danger-alert-badge'}">0</span>`;
      if (item.id === 'devices' && role === 'management') badgeHtml = `<span class="nav-badge" id="alert-badge">0</span>`;

      if (role === 'management') {
        const sectionId = item.mgmtHref.replace('#', '');
        navHtml += `
          <div class="nav-item${activeClass}" onclick="showSection('${sectionId}', this)" data-page="${item.id}">
            ${item.icon}
            <span>${item.title}</span>
            ${badgeHtml}
          </div>
        `;
      } else {
        navHtml += `
          <a class="nav-item${activeClass}" data-page="${item.id}" href="${item.adminHref}">
            ${item.icon}
            <span>${item.title}</span>
            ${badgeHtml}
          </a>
        `;
      }
    }
  });

  sidebar.innerHTML = navHtml;
});

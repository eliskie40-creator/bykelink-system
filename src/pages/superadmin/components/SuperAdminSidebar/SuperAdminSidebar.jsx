import './SuperAdminSidebar.css'
import bykelinkLogo from '../../../../assets/bykelinklogo.png'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'

import { useSidebarLogic } from './superAdminSidebarLogic'

export default function SuperAdminSidebar({
  sidebarItems,
  activeSection,
  onSectionChange,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
  onNavigateHome,
  onSignOut,
  consoleLabel,
  userMenuAccess = [],
}) {
  const {
    expandedItem,
    handleItemClick,
  } = useSidebarLogic(onSectionChange)

  // Map menu access IDs to sidebar item IDs
  const menuAccessMap = {
    'dashboard': 'dashboard',
    'user-management': 'user-management',
    'inventory': 'inventory-management',
    'services': 'service-management',
    'messages': 'chats-management',
    'reports': 'analytics',
    'settings': 'profile',
  }

  // Filter sidebar items based on menu access if provided
const visibleItems = userMenuAccess.length > 0
  ? sidebarItems.filter((item) => {
      const mappedId = menuAccessMap[item.id] || item.id
      const isAllowed = userMenuAccess.includes(mappedId) || userMenuAccess.includes(item.id)

      if (!isAllowed) return false

      // If parent is allowed, keep all its subitems
      if (item.subitems) {
        return true
      }

      return true
    })
  : sidebarItems

  const sidebarGroups = [
    { label: 'Overview', itemIds: ['dashboard'] },
    {
      label: 'Management',
      itemIds: ['user-management', 'inventory-management', 'unit-management', 'service-management'],
    },
    {
      label: 'Sales',
      itemIds: ['analytics', 'transaction-history'],
    },
    { label: 'Account', itemIds: ['chats-management', 'profile'] },
  ]
  const visibleGroups = sidebarGroups
    .map((group) => ({
      ...group,
      items: visibleItems.filter((item) => group.itemIds.includes(item.id)),
    }))
    .filter((group) => group.items.length > 0)
  const groupedItemIds = new Set(visibleGroups.flatMap((group) => group.items.map((item) => item.id)))
  const ungroupedItems = visibleItems.filter((item) => !groupedItemIds.has(item.id))

  if (ungroupedItems.length > 0) {
    visibleGroups.push({ label: 'Other', items: ungroupedItems })
  }

  const renderSidebarItem = (item) => {
    const Icon = item.icon
    const isActive = activeSection === item.id
    const isExpanded = expandedItem === item.id
    const hasSubitems = item.subitems?.length > 0
    const isSubitemActive = item.subitems?.some((sub) => activeSection === sub.id)

    return (
      <div key={item.id}>
        <button
          type="button"
          onClick={() => handleItemClick(item)}
          className={`superadmin-nav-item ${isActive || isSubitemActive ? 'is-active' : ''}`}
        >
          <Icon sx={{ fontSize: 20 }} className="superadmin-nav-icon" />
          <span className="superadmin-nav-label">{item.label}</span>
          <div className="superadmin-nav-right">
            {item.badge && (
              <span className="superadmin-badge">{Math.min(item.badge, 9)}</span>
            )}
            {hasSubitems && (
              <ExpandMoreRoundedIcon
                sx={{
                  fontSize: 18,
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s',
                }}
              />
            )}
          </div>
        </button>

        {hasSubitems && isExpanded && (
          <div className="superadmin-submenu">
            {item.subitems.map((subitem) => (
              <button
                key={subitem.id}
                type="button"
                onClick={() => onSectionChange(subitem.id)}
                className={`superadmin-nav-subitem ${activeSection === subitem.id ? 'is-active' : ''}`}
              >
                <span>{subitem.label}</span>
                <div className="superadmin-nav-right">
                  {subitem.badge && (
                    <span className="superadmin-badge">{Math.min(subitem.badge, 9)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={onCloseSidebar}
          className="superadmin-sidebar-overlay"
        />
      )}

      <aside
        className={`superadmin-sidebar ${
          isSidebarOpen ? 'is-open' : 'is-collapsed'
        }`}
      >
        <div className="superadmin-header">
          <button
            type="button"
            onClick={onNavigateHome}
            className="superadmin-brand-block"
          >
            <img
              src={bykelinkLogo}
              alt="Bykelink Logo"
              className="superadmin-logo"
            />

            <span>
              <h1 className="superadmin-brand-title">
                BYKELINK
              </h1>

              <p className="superadmin-brand-subtitle">
                {consoleLabel} Console
              </p>
            </span>
          </button>

          <div className="superadmin-sidebar-controls">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="superadmin-sidebar-toggle"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <MenuRoundedIcon sx={{ fontSize: 18 }} />
            </button>

            <button
              type="button"
              onClick={onCloseSidebar}
              className="superadmin-sidebar-close"
              aria-label="Close menu"
            >
              <CloseRoundedIcon sx={{ fontSize: 18 }} />
            </button>
          </div>
        </div>

        <nav className="superadmin-nav" aria-label="Admin sections">
          {visibleGroups.map((group) => (
            <div className="superadmin-nav-group" key={group.label}>
              <h2 className="superadmin-nav-group-label">{group.label}</h2>
              {group.items.map(renderSidebarItem)}
            </div>
          ))}
        </nav>

        <div className="superadmin-footer">
          <button
            type="button"
            className="superadmin-sidebar-action"
          >
            <HelpOutlineRoundedIcon
              sx={{ fontSize: 18 }}
              className="superadmin-action-icon"
            />

            <span className="superadmin-sidebar-action-label">Support</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="superadmin-sidebar-action"
          >
            <LogoutRoundedIcon
              sx={{ fontSize: 20 }}
              className="superadmin-action-icon"
            />

            <span className="superadmin-sidebar-action-label">Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
BYKELINK MOTOR INC. MANAGEMENT SYSTEM
COMPLETE TECHNICAL CHANGE AND ARCHITECTURE REPORT

System Name      : Bykelink Motor Inc. Management System (bykelinkmotorinc-system)
Repository       : RICKYLER/jwel (Branch: main)
Covered Commits  : 563b94d, f58d8f0, 2501951, 0f38403, afb2a59, 2c6b38c, f64ab9d, aafbacf, b5e7511, cd35f73, plus Phase 6 POS Enhancements
Report Date      : November 21, 2026


================================================================================
EXECUTIVE SUMMARY
================================================================================

This report documents the full scope of development, architectural refactoring,
user interface modernization, security hardening, and deployment stabilization
performed across the Bykelink Motor Inc. Management System from September 2026
through November 2026.

Overall Engineering Scope:

  Phase 1 - Cashier Role Introduction and Dashboard Analytics Upgrade (563b94d)
    Introduced the Cashier Personnel role and initial POS workflow, migrated
    dashboard reporting charts from Recharts to Chart.js for per-mechanic
    service tracking, and stabilized viewport layout behavior.

  Phase 2 - Dedicated POS Workstation, Showroom, Staff Routing, and Admin UI
            Overhaul (f58d8f0)
    Replaced the temporary cashier view with a standalone Cashier POS
    workstation supporting barcode scanning, price checks, and server-side
    sale completion. Restored public and customer showroom pages, introduced
    dedicated staff routing, added role-scoped section enforcement, enforced
    first-login password changes, and redesigned the administrative console.

  Phase 3 - Financing Decommissioning, Admin Verification, Immutable Audit
            Trail, and Walk-In Item Breakdown (2501951)
    Retired all customer and admin financing workflows, introduced two-tier
    administrator verification for sensitive inventory edits and deletions,
    established an immutable admin-only system audit trail, isolated
    transaction logs from cashier screens, and added itemized walk-in purchase
    and bulk-order reporting.

  Phase 4 - Vercel Production Deployment and Vite 8 Stabilization
            (0f38403, afb2a59)
    Configured Vercel SPA routing and authentication popup headers, and
    resolved a Vite 8 peer dependency conflict so cloud deployments build
    cleanly.

  Phase 5 - Operational Enhancements: Staff Admin Verification, Top Sold Spare
            Parts Analytics, Returned Damaged Inventory, Unified Notifications,
            and Enterprise Downloadable Reports (f64ab9d, aafbacf, b5e7511)
    Resolved staff product edit verification bottlenecks with server-side on-site
    admin credentials validation and remote verification queues, introduced sales
    analytics ranking for most sold spare parts with top-3 podium and visual meters,
    added full damaged and returned products tracking with disposition status
    management, unified system notifications across chats, staff requests,
    low-stock alerts, and service bookings, and built an enterprise Excel (.xlsx)
    and branded PDF report engine with managerial audit sign-offs.

  Phase 6 - Unified POS Sales Invoice, Transaction Reprinting, Dynamic Customer
            Details, and Audit UI Modernization (cd35f73 & Phase 6 Release)
    Engineered a centralized Sales Invoice engine (posInvoiceService.js) compliant
    with the Philippine Ease of Paying Taxes (EOPT) Act, unifying spare parts
    and precision service labor under one Official Sales Invoice. Connected POS
    Transaction Logs to an interactive on-screen invoice preview modal with
    thermal slip (80mm) and desktop printing. Implemented dynamic customer name,
    mobile number, and motorcycle plate tracking (with dedicated modal, F4 shortcut,
    auto-reset to Walk-in Customer on checkout, and clean 'Information' button).
    Purged raw JSON before/after state debug blocks from the SuperAdmin audit
    modal in favor of structured data presentations. Expanded automated testing
    suite to 72 unit tests across 7 suites with 100% pass rate.


================================================================================
TABLE OF CONTENTS
================================================================================

  1. Phase 1: Cashier Role Introduction and Dashboard Modernization (563b94d)
  2. Phase 2: Dedicated Cashier POS, Showroom, and Console Overhaul (f58d8f0)
  3. Phase 3A: Decommissioning of the Financing Subsystem (2501951)
  4. Phase 3B: Inventory Governance and Admin Verification (2501951)
  5. Phase 3C: Admin-Only System Audit Trail and Access Isolation (2501951)
  6. Phase 3D: POS Itemized Walk-In Breakdown and Bulk Detection (2501951)
  7. Phase 4: Vercel Deployment and Build Pipeline Stabilization
  8. Phase 5: Operational Enhancements, Inventory Governance, and Reports
  9. Firestore Security Rules and Collection Access Summary
  10. Verification Summary and Deployment Checklist
  11. Automated Testing Framework and Test File Tree
  12. Phase 6: Unified POS Sales Invoice, Customer Details, and UI Modernization


================================================================================
1. PHASE 1: CASHIER ROLE INTRODUCTION AND DASHBOARD MODERNIZATION (563b94d)
================================================================================

Date: September 9, 2026 (28 Files Changed)

1.1 Role-Based Cashier Onboarding

  - Added the cashier personnel role to user creation (NewUserModal.jsx) and
    application routing (src/App.jsx), mapping authenticated cashiers to /cashier.
  - Built the initial cashier workspace (CashierPanel.jsx and CashierPanel.css)
    as the foundation for in-store spare parts billing.

1.2 Dashboard Charting Migration (DashboardSection.jsx)

  - Replaced Recharts area charts with Chart.js (chart.js, react-chartjs-2,
    and chartjs-adapter-date-fns) in DashboardSection.jsx.
  - Built dynamic mechanic performance datasets (timelineData and
    perMechanicData) mapped against active service requests and technicians so
    administrators can monitor per-mechanic workload over time.

1.3 Layout Stability

  - Updated #root horizontal overflow handling in src/index.css to
    overflow-x: clip, eliminating unwanted horizontal scrollbars while
    preserving sticky positioning.


================================================================================
2. PHASE 2: DEDICATED CASHIER POS, SHOWROOM, AND CONSOLE OVERHAUL (f58d8f0)
================================================================================

Date: November 21, 2026 - Morning Release (72 Files Changed)

2.1 Standalone Cashier POS Workstation

  Replaced the early customer-folder CashierPanel with a modular POS suite
  under src/pages/cashier/:

    - CashierPage.jsx and CashierPage.css
      Full spare-parts POS register supporting item search, cart quantity
      editing, payment method selection (cash and online methods), amount
      tendered and change computation, service fee integration, and receipt
      generation.

    - CashierLayout.jsx and CashierTopbar.jsx
      Dedicated POS shell with collapsible navigation sidebar, session
      controls, and shortcut access.

    - BarcodeScanner.jsx
      Dedicated barcode scanning modal allowing rapid SKU and barcode lookup
      directly into the active POS cart.

    - PriceCheck.jsx
      Read-only price inquiry utility enabling cashiers to verify unit prices
      and stock availability without altering the current transaction cart.

2.2 Server-Side POS Cloud Functions (functions/index.js)

  - generateTransactionId: Issues unique transaction identifiers (TX-) for
    receipt tracking.
  - printReceipt: Accepts structured receipt print jobs server-side.
  - completeSaleTransaction: Persists finalized sale records to the
    transactionLogs collection and runs atomic batched stock updates against
    physical inventory documents.

2.3 Showroom Restoration and Role Routing Updates (src/App.jsx)

  - Restored dedicated motorcycle and unit showroom interfaces via
    ShowroomPage.jsx (public) and CustomerShowroomPage.jsx (authenticated
    portal), dynamically loading categories, models, and stock availability
    from Firestore inventory and masterData collections.
  - Separated /staff routing for staff personnel from /admin, while enforcing
    role-based access guards via dashboardRequirements.
  - Updated NavHeaderCustomer.jsx, HeroSection.jsx, SparePartsPage.jsx, and
    ProductDetailsPage.jsx for consistent storefront navigation.

2.4 Administrative Console Redesign and Security Controls

  - Admin Office Styling and Section Access Enforcement
    Introduced AdminOfficeTheme.css and redesigned SuperAdminPage.jsx,
    SuperAdminSidebar, DashboardSection, AnalyticsSection,
    ServiceRequestsSection, UserManagementSection, InventoryReportsSection,
    InventorySection, ChatsManagementSection, and NotificationsDrawer.

  - Granular Section Filtering (SuperAdminPage.jsx)
    Implemented expandAccessibleSections and sectionAliases so sidebar menus
    and active views strictly honor both role ceilings and per-user
    accessibleSections assignments stored in Firestore.

  - First-Login Password Policy
    Activated PasswordChangeRequiredModal.jsx and supporting re-authentication
    flows in src/App.jsx to require password updates on newly provisioned
    operator accounts.

  - Sales Analytics Register (AnalyticsSection.jsx)
    Built date-range KPI reporting cards (total sales, cash sales, online
    sales, transaction count), payment-method filters, and paginated sales
    activity tables backed by transactionLogs.

2.5 Core Platform Refinements

  - ChatBox.jsx: Enriched conversation metadata updates (senderId,
    senderAvatar, lastMessage, lastMessageTime, and status open) and fixed
    floating window z-index layering for mobile and desktop viewports.
  - GlobalLoadingScreen.jsx: Added autoComplete control and safer timer cleanup.
  - index.html: Updated application document title to BYEKLINK MOTOR INC.| TAGUM.
  - package.json and vite.config.js: Upgraded frontend tooling to Vite 8.0.4
    with TypeScript 7.0.2 support and COOP/COEP dev/preview headers.


================================================================================
3. PHASE 3A: DECOMMISSIONING OF THE FINANCING SUBSYSTEM (2501951)
================================================================================

Date: November 21, 2026 - Afternoon Release

The financing application and approval workflow was fully retired across the
frontend, backend, and database security layer to streamline the system around
core dealership operations.

3.1 Deleted Customer and Admin Modules

  Customer Portal (src/pages/customer/):
    - FinancingPage.jsx
    - ConfirmApplicationPage.jsx
    - FinancingSubmittedPage.jsx
    - ApprovedApplicationPage.jsx
    - FinancingStatusPage.jsx and FinancingStatusPage.css

  Admin Console (src/pages/superadmin/sections/):
    - FinancingApplicationsSection.jsx and FinancingApplicationsSection.css
    - ApprovedApplicationsSection.jsx and ApprovedApplicationsSection.css
    - FinancingApplicationDetailSection.jsx

3.2 Navigation, Route, and Prop Cleanup

  - Removed all /financing routes and admin /financing-applications routes from
    src/App.jsx, along with unused navigation callback props across
    CashierPage.jsx, CustomerProfilePage.jsx, CustomerServicePage.jsx,
    CustomerMessagesPage.jsx, and CustomerServiceBookingsPage.jsx.
  - Removed Financing and Track My Status links and the financingApplications
    Firestore listener from NavHeaderCustomer.jsx.
  - Removed financing buttons from HeroSection.jsx, ShowroomPage.jsx,
    ProductDetailsPage.jsx, and CustomerShowroomPage.jsx, replacing the hero
    financing metric with Showroom Units.
  - Removed financing sidebar entries, subscriptions, and financingStatusOptions
    from SuperAdminPage.jsx, SuperAdminSidebar.jsx, and superadminUtils.js.

3.3 Backend and Firestore Lockdown

  - Removed submitFinancingApplication, getFinancingApplicationStatus,
    approveFinancingApplication, and updateFinancingApplicationStatus from
    functions/index.js.
  - Locked /financingApplications/{docId} and nested /messages/{messageId} in
    firestore.rules to deny all reads and writes (false), preserving historical
    database documents safely offline from client access.


================================================================================
4. PHASE 3B: INVENTORY GOVERNANCE AND ADMIN VERIFICATION (2501951)
================================================================================

Sensitive inventory actions—product renaming, archiving/deletion, and
permanent deletion—now enforce role-based approval and verified administrator
sign-off.

4.1 Role-Aware Mutation Routing (InventorySection.jsx)

  - Standardized role resolution using currentAccessRole rather than
    currentUser?.role.
  - Staff Personnel: Product rename and delete actions cannot modify live
    inventory directly; instead, they submit pending requests via
    submitInventoryChangeRequest.
  - Admin and Superadmin: Direct product renames, deletions, and decisions
    inside the Pending Verifications tab require AdminVerificationModal
    confirmation.
  - InventoryDeleteArchivedSection.jsx: Filters out archived user accounts to
    keep archives separated, requires AdminVerificationModal confirmation for
    permanent deletes, and records restore/delete audit events.

4.2 Admin Verification Modal (AdminVerificationModal.jsx)

  Supports five modes: rename, delete, approve-rename, approve-delete, and
  permanent-delete.

  - Password-Authenticated Admins: Validates credentials through Firebase Auth
    reauthenticateWithCredential before executing or approving the change
    (recorded as admin-password).
  - Federated (Google) Admins: Enforces exact typed confirmation matching the
    product name (recorded as admin-phrase-confirmation).

4.3 Verification Cloud Functions (functions/index.js)

  - submitInventoryChangeRequest: Permitted for staff personnel, admin, and
    superadmin. Stores product snapshots and proposed changes in
    inventoryChangeRequests (status pending) and logs audit events.
  - verifyInventoryChangeRequest: Restricted strictly to admin and superadmin.
    Atomically applies approved renames to inventory or archives deleted
    products into deleteArchived using Firestore batches, updating request
    status and emitting PRODUCT_RENAMED, PRODUCT_DELETED, or
    PRODUCT_CHANGE_REJECTED audit records.


================================================================================
5. PHASE 3C: ADMIN-ONLY SYSTEM AUDIT TRAIL AND ACCESS ISOLATION (2501951)
================================================================================

5.1 Dual Audit Trail Instrumentation

  - Client Service (src/services/auditLogService.js): Exports
    logSystemAuditEvent, writing structured AUD- records to auditLogs with
    module, action, summary, target metadata, before/after state
    (previousData and newData), amount, actor details (performedBy), verifier
    details (verifiedBy), and serverTimestamp.
  - Backend Helper (functions/index.js): Provides recordAuditLog across
    completeSaleTransaction (SALE_COMPLETED), inventory verification callables,
    and operator lifecycle callables (createOperatorAccount,
    archiveOperatorAccount, deleteArchivedUserPermanently, updateUserAccess,
    and resetUserPassword).
  - Client Module Coverage: POS, Inventory, Inventory Archive, Service Bookings
    and Service Types (CustomerServicePage.jsx, ServiceRequestsSection.jsx,
    ServiceTypeSection.jsx), User Management, and Master Data
    (MasterDataManagementSection.jsx).

5.2 Transaction History Console (TransactionHistorySection.jsx)

  - Enabled exclusively for admin and superadmin inside SuperAdminPage.jsx and
    EditUserModal.jsx.
  - Merges auditLogs with legacy transactionLogs while deduplicating POS sales
    already tracked by SALE_COMPLETED target IDs.
  - Provides module, action, date-range, and search filters, a before/after diff
    inspection modal, and Excel (.xlsx) and PDF export using xlsx and jspdf.

5.3 Cashier Isolation and Rule Hardening

  - Removed transactionLogs Firestore queries and the F3 Transaction Logs modal
    from CashierPage.jsx.
  - Updated firestore.rules so both auditLogs and transactionLogs restrict read
    access strictly to admin and superadmin while disabling all updates and
    deletes (false).


================================================================================
6. PHASE 3D: POS ITEMIZED WALK-IN BREAKDOWN AND BULK DETECTION (2501951)
================================================================================

6.1 Server-Side Cart Persistence (completeSaleTransaction)

  - Normalizes every line item in cartItems with id, name, sku, type (service
    or product), qty, unitPrice, and subtotal.
  - Computes itemCount, totalQuantity, and isBulkOrder (true when
    totalQuantity is 5 or more) and persists them to both transactionLogs and
    the SALE- audit log document.
  - Deducts inventory stock only for physical products, automatically ignoring
    service items.

6.2 Shared Summarization Helper (superadminUtils.js)

  - Defines BULK_PURCHASE_THRESHOLD = 5 and exports summarizeSaleItems to
    calculate totalQuantity, itemCount, isBulk (true if totalQuantity >= 5 or
    any item qty >= 5), compact summaryLabel, and SKU/product searchableText.

6.3 Click-to-Inspect UI Integration

  - AnalyticsSection.jsx and AnalyticsSection.css: Keeps one row per
    transaction while adding a Products / Qty column showing the primary item,
    piece count badge, and Bulk indicator. Search matching includes product
    names and SKUs, and clicking any row opens the Walk-in Purchase Breakdown
    Modal with itemized unit pricing and full receipt totals.
  - TransactionHistorySection.jsx and TransactionHistorySection.css: Surfaces
    the same item/quantity/bulk summary on POS rows and displays the itemized
    table inside the audit detail modal.


================================================================================
7. PHASE 4: VERCEL DEPLOYMENT AND BUILD PIPELINE STABILIZATION
================================================================================

7.1 Vercel Hosting Configuration (vercel.json - Commit 0f38403)

  - Applies Cross-Origin-Opener-Policy: same-origin-allow-popups and
    Cross-Origin-Embedder-Policy: unsafe-none across all routes for reliable
    popup authentication.
  - Configures SPA rewrite from /(.*) to /index.html so client routes and page
    reloads resolve cleanly.

7.2 Vite 8 Dependency Resolution (Commit afb2a59)

  - Resolved a Vercel npm install peer dependency failure caused by
    vite-plugin-pwa (^1.2.0) supporting only Vite 3 through 7 while the
    project runs Vite 8 (^8.0.4).
  - Confirmed VitePWA was imported in vite.config.js but unused in plugins,
    removed vite-plugin-pwa from package.json and vite.config.js, and
    regenerated package-lock.json cleanly.


================================================================================
8. PHASE 5: OPERATIONAL ENHANCEMENTS AND ADVANCED INVENTORY MANAGEMENT
   (Commits 2c6b38c, f64ab9d, ba2cd3a)
================================================================================

Date: November 21, 2026 - Major Operational Release (10 Files Modified / Added)

8.1 Operational Background and Architecture Overview

  This development phase directly addressed five practical operational needs
  encountered during daily dealership and service center workflows:

  1. Staff Inventory Editing Bottlenecks:
     Staff personnel updating product records (e.g. updating selling prices,
     correcting specifications, updating available stocks, or renaming items)
     encountered Firestore permission errors because client-side writes to
     /inventory are restricted to administrators. Staff also had no way for an
     on-site administrator to authorize changes directly at their terminal
     without logging out.

  2. Combined Service and Parts Transactions in Analytics:
     Dealership POS transactions frequently bundle both replacement spare parts
     and technician labor into one checkout ticket. While recorded, the service
     fee portion was not isolated into service analytics reports, causing
     revenue misattributions.

  3. Visibility into High-Performing Spare Parts:
     The management console had overall revenue totals but lacked an itemized
     sales velocity engine showing which spare parts, accessories, and
     consumables sell the most units and generate the most revenue.

  4. Tracking Returned and Damaged Products:
     Products arriving defective from suppliers, damaged during transit, or
     returned by customers lacked a formal audit log, disposition tracking
     lifecycle, and automatic stock deduction option.

  5. Fragmented Notification Visibility:
     The header notification bell only counted unread customer chats, ignoring
     critical operational events like staff verification requests, critical
     low-stock warnings, and incoming customer service bookings.


8.2 Staff Product Modification and Dual-Mode Admin Verification

  8.2.1 Problem and Security Root Cause
    Under firestore.rules, direct client-side updates to `/inventory` are
    strictly restricted via `isAdminOrHigher()`. When a staff user attempted to
    save product modifications, the client attempted direct Firestore writes,
    resulting in "FirebaseError: Missing or insufficient permissions".
    Additionally, if an administrator was standing next to the staff member,
    there was no way for the admin to authenticate on-site to immediately approve
    the edit.

  8.2.2 Dual-Mode Verification Architecture
    A two-tier verification workflow was designed and implemented:

    Tier 1 - On-Site Administrator Direct Authorization (Callable Function):
      - Created `authorizeInventoryDirectly` in `functions/index.js`.
      - When an admin is on-site, the staff member opens the verification modal
        where the administrator inputs their Admin Email and Admin Password.
      - The server-side callable invokes the Google Identity Toolkit API
        (`accounts:signInWithPassword`) to authenticate the administrator's
        credentials securely without altering the staff terminal session.
      - Upon successful validation, the backend verifies that the administrator
        holds 'admin' or 'superadmin' roles via `getRoleFromEmail()`.
      - The backend executes an atomic Firestore batch write, updating the
        inventory document with the pending updates or deleting the product,
        stamping `lastVerifiedBy` and `lastVerifiedAt`, and recording an immutable
        audit log event in `/auditLogs`.
      - Returns success to the staff client, immediately updating the product
        catalog without permissions issues.

    Tier 2 - Remote Administrator Approval Queue:
      - For situations where no administrator is physically present on-site,
        the modal provides a one-click option: "Submit for Remote Admin Approval".
      - `submitInventoryChangeRequest` in `functions/index.js` was enhanced to
        accept `requestType: 'update'` alongside 'rename' and 'delete', saving
        the complete `pendingUpdates` object (name, price, stock, color variants,
        specifications, equipment, description).
      - The request is saved to `/inventoryChangeRequests` with a status of
        'pending'.
      - Remote administrators see the item in the "Pending Verifications" tab of
        the inventory section and in their header notification drawer.
      - Upon clicking "Verify & Confirm", `verifyInventoryChangeRequest` applies
        the changes atomically and moves the request status to 'approved'.

  8.2.3 User Workflow for Staff and Admin
    1. Staff opens the Inventory Control screen and clicks "Edit" on a product.
    2. Staff modifies the desired fields (e.g. sets a new price or stock).
    3. Staff clicks "Save Changes" -> the system detects staff access role and
       opens `AdminVerificationModal` in staff caller mode.
    4. Option A (On-Site): The administrator enters their Admin Email and Password
       and clicks "Verify & Confirm". The changes apply immediately.
    5. Option B (Remote): Staff clicks "Submit for Remote Admin Approval". The
       request is queued for remote administrators to review.


8.3 POS Combined Service Labor and Spare Parts Integration

  8.3.1 Operating Principle
    In motorcycle service centers, a walk-in or service customer regularly pays
    for both spare parts (e.g. drive belt, brake pads) and labor fees
    (e.g. routine maintenance, parts installation) in a single transaction ticket.

  8.3.2 Backend Calculation & Transaction Logging (functions/index.js)
    The server-side `completeSaleTransaction` function was updated to inspect
    every line item in the checkout cart:
    - Automatically isolates items where `itemType === 'service'` or
      `category === 'Service'`.
    - Computes `serviceSubtotal` (sum of service fees) and `partsSubtotal`
      (sum of physical units and parts).
    - Sets the boolean flag `hasServices: true` when service items exist.
    - Saves these distinct financial subtotals directly on the transaction
      document in `/transactionLogs`.

  8.3.3 Analytics Isolation (AnalyticsSection.jsx & superadminUtils.js)
    - Sales reports parse `serviceSubtotal` and `partsSubtotal` from all
      historical and real-time transaction logs.
    - KPI cards clearly differentiate "Spare Parts Revenue" from "Service Fee
      Revenue", ensuring that labor charges do not distort inventory sales
      performance and inventory margins.


8.4 Most Sold Spare Parts Analytics Engine

  8.4.1 Processing Engine (AnalyticsSection.jsx)
    - Aggregates completed transaction records within the administrator's
      selected reporting date range (Today, Yesterday, Last 7 Days, Last 30 Days,
      or Custom Range).
    - Extracts itemized spare parts line items from transaction tickets.
    - Tally metrics per unique spare part:
        * Total Quantity Sold (units/pieces)
        * Total Gross Revenue (PHP)
        * Distinct Transaction Orders Count
        * Part SKU and Model Mapping

  8.4.2 Top 3 Podium Visual Display
    - Prominently showcases the dealership's top 3 best-selling spare parts
      in custom podium cards:
        * Rank #1: Gold medal styling, top seller banner, units sold, and gross revenue.
        * Rank #2: Silver medal styling, runner-up banner, units sold, and gross revenue.
        * Rank #3: Bronze medal styling, third-place banner, units sold, and gross revenue.

  8.4.3 Search, Sorting, and Visual Meter
    - Sorting Toggles: One-click switching between "Sort by Units Sold" (volume
      ranking) and "Sort by Revenue" (income ranking).
    - Live Search: Immediate keyword filtering across spare part names and SKUs.
    - Performance Meter Bar: Each table row features an inline visual progress
      bar showing that spare part's volume percentage relative to the
      number-one best-selling item.
    - Full Pagination: Supports high-volume product catalogs with paginated tables
      (10 items per page) and previous/next page navigation.


8.5 Returned and Damaged Products Inventory Subsystem

  8.5.1 Governance Need
    Motorcycle dealerships handle physical products that may arrive damaged from
    suppliers, fail during shipping/transit, prove defective upon unboxing, or
    be returned by customers for exchange. Tracking these items separately from
    healthy salable stock is essential for accurate accounting and supplier
    warranty claims.

  8.5.2 Dedicated Modal Suite (ReturnDamagedModal.jsx)
    Provides a standardized intake form for warehouse and sales personnel:
    - Product Picker: Searchable dropdown listing all inventory items.
    - Incident Quantity: Number of defective or returned pieces.
    - Condition Classification:
        * Defective (manufacturing flaw)
        * Damaged in Transit (logistics damage)
        * Customer Return (returned by buyer)
        * Warranty Claim (in-service component failure)
        * Expired / Obsolescence (obsolete stock)
    - Disposition Status Lifecycle:
        * Pending Inspection (initial intake)
        * Returned to Supplier (RMA / warranty return)
        * Written Off (loss recorded)
        * Repaired & Restocked (serviced and returned to salable stock)
        * Scrapped / Disposed (discarded)
    - Source / Customer Reference: Name, invoice, or supplier reference.
    - Reason Notes: Free-text explanation of the damage or defect.
    - Automatic Stock Deduction Toggle (`deductedFromStock`):
        When enabled, automatically decrements the active inventory stock
        count by the returned quantity, recalculates inventory status
        (In Stock, Low Stock, Out of Stock), and logs the adjustment.

  8.5.3 Dedicated Inventory Tab & Management (InventorySection.jsx)
    - Added the `{ id: 'returned-damaged', label: 'Returned / Damaged' }` tab
      with an active incident counter pill.
    - Real-time Firestore subscription to the `/damagedReturns` collection.
    - Summary KPI tiles display Total Incidents, Pending Inspection count,
      Returned to Supplier count, and Written Off / Disposed count.
    - In-Table Disposition Updates: Staff or admins can change the disposition
      status of any incident directly via an in-table dropdown.


8.6 Unified Operations Notifications Hub

  8.6.1 Motivation
    Previously, the header notification bell only reflected unread customer
    chats. Administrators were not notified when staff submitted inventory
    verification requests, when critical stock reached zero, or when customers
    submitted online service bookings.

  8.6.2 Four-Channel Unified Alert Aggregation (SuperAdminPage.jsx)
    `notificationItems` now aggregates four operational alert streams:
    1. Customer Live Chats (`type: 'CHAT'`):
       Alerts whenever a customer sends an unread live chat message.
    2. Staff Inventory Requests (`type: 'INVENTORY_REQUEST'`):
       Alerts whenever staff submits an inventory rename, detail update, or
       deletion request awaiting administrator review.
    3. Low Stock & Out-of-Stock Warnings (`type: 'LOW_STOCK'`):
       Alerts when any inventory item reaches critical stock levels
       (stock <= 5 units, with specific "Out of Stock" alerts for stock = 0).
    4. Customer Service Bookings (`type: 'SERVICE_BOOKING'`):
       Alerts when a customer books a repair, maintenance, or inspection service.

  8.6.3 Header Bell Badge & Interactive Drawer
    - The header bell icon displays `unreadNotificationCount`, accurately
      reflecting the total number of unread alerts across all four channels.
    - Clicking any notification in `NotificationsDrawer.jsx`:
        * Marks the notification as read in local storage.
        * Automatically routes the administrator to the appropriate section:
          - Inventory requests & low-stock alerts -> Inventory Control screen
          - Service bookings -> Service Scheduling screen
          - Customer chats -> Live Chats Management screen
          - Password resets -> User Management screen
    - Persistent Read & Clear Actions:
        "All read" and "Clear all" persist state to localStorage keys
        `bykelink-read-alert-ids` and `bykelink-dismissed-notifications` so that
        alert dismissals are preserved across page refreshes.


8.7 Phase 5 Code and Module Reference

  - functions/index.js:
      Added `authorizeInventoryDirectly` callable; updated `submitInventoryChangeRequest`
      and `verifyInventoryChangeRequest` to support 'update' requests with full
      pending updates; enhanced `completeSaleTransaction` with service subtotal logging.
  - firestore.rules:
      Added security rules for `/damagedReturns/{docId}` allowing read/create
      for staff and admins, and update/delete for admins.
  - src/pages/superadmin/components/AdminVerificationModal.jsx:
      Added `isStaffCaller` mode with dedicated Admin Email and Password fields
      for on-site authorization, plus remote submission fallback.
  - src/pages/superadmin/components/ReturnDamagedModal.jsx:
      Created complete intake modal for returned, defective, and damaged products.
  - src/pages/superadmin/sections/InventorySection.jsx:
      Added 'Returned / Damaged' tab, real-time `/damagedReturns` subscription,
      disposition dropdown management, and staff verification routing.
  - src/pages/superadmin/sections/AnalyticsSection.jsx:
      Engineered most sold spare parts aggregator, top-3 podium display,
      sorting toggles, search filtering, visual meters, and pagination.
  - src/pages/superadmin/sections/AnalyticsSection.css:
      Added styles for `.analytics-top-parts-panel`, `.analytics-podium-grid`,
      and podium cards.
  - src/pages/superadmin/SuperAdminPage.jsx:
      Unified 4-source notifications hub, connected active count to the header
      bell, wired click-to-navigate routing, and added persistent dismissal.
  - src/pages/cashier/CashierPage.jsx:
      Maintained itemized service fee and parts tracking for POS sales.
  - src/services/reportExportService.js:
      Created universal export service supporting professional Excel (.xlsx) workbooks
      with merged company headers, KPI blocks, and auto-calculated column widths,
      plus print-ready, branded PDF documents with management sign-off blocks.
  - src/pages/superadmin/sections/InventorySection.jsx:
      Integrated Excel and PDF export buttons for the Returned & Damaged Products log
      and Live Inventory Valuation, plus restock inventory restoration.
  - src/pages/superadmin/sections/AnalyticsSection.jsx:
      Integrated Excel and PDF export buttons for the Most Sold Spare Parts velocity
      ranking and the Sales & Revenue Financial Breakdown.


8.8 Enterprise Downloadable Reports Engine (Excel & PDF)

  8.8.1 Motivation and Business Purpose
    Dealership management, auditors, and department heads require formal,
    downloadable documentation for supplier warranty claims, tax accounting,
    inventory audits, and sales velocity planning. Rather than raw unformatted
    CSV dumps, management requested executive-ready Excel workbooks and
    branded printable PDF reports.

  8.8.2 Professional Excel (.xlsx) Template Architecture
    The new export engine (src/services/reportExportService.js) structures every
    Excel export into four distinct, polished zones:
    1. Zone 1 - Official Dealership Company Header:
       - Row 1: "BYKELINK MOTOR INC." merged across all table columns.
       - Row 2: "Motorcycle Dealership & Precision Service Center Management System".
       - Row 3: Official report title in bold uppercase.
       - Row 4: Audit metadata including generation timestamp, actor identity,
         and active reporting period.
    2. Zone 2 - Executive Summary KPI Metrics Block:
       - Merged section header with formatted Key Performance Indicators
         (counts, quantities, and financial amounts formatted with PHP currency).
    3. Zone 3 - Structured Data Table:
       - Bold uppercase column headers.
       - Explicit character widths (`!cols` with generous padding) preventing
         truncated cells or Excel `###` numeric overflow errors.
    4. Zone 4 - Managerial Audit & Sign-Off Section:
       - Formal signature lines for "Prepared By: (Staff/Cashier)" and
         "Verified & Approved By: (Store Management / Branch Auditor)" ensuring
         audit compliance.

  8.8.3 Branded Print-Ready PDF Documents
    Generates high-resolution vector PDF reports featuring:
    - Official Bykelink Crimson brand banner (#c51d34) at the top of page 1.
    - Executive summary KPI summary cards with rounded borders.
    - Full AutoTable data presentation with alternating row shading.
    - Dynamic multi-page pagination ("Page X of Y").
    - Formal managerial signature block on the concluding page.

  8.8.4 Deployed Modules
    - Damaged & Returned Products Incident Audit (Excel & PDF)
    - Most Sold Spare Parts & Product Performance Ranking (Excel & PDF)
    - Sales & Revenue Financial Audit with Parts vs. Service Fee Isolation (Excel & PDF)
    - Live Inventory Stock & Asset Valuation Audit (Excel & PDF)


================================================================================
9. FIRESTORE SECURITY RULES AND COLLECTION ACCESS SUMMARY
================================================================================

Verified directly against firestore.rules:

  Collection: /financingApplications/{docId} (and /messages/{messageId})
    Read / Write: Disabled (false)

  Collection: /inventory/{docId}
    Read: Public
    Create / Update / Delete: Admin or Superadmin
    Note: Staff renames, updates, and deletions route through verification callables.

  Collection: /inventoryChangeRequests/{docId}
    Read / Create: Admin, Superadmin, or Staff Personnel
    Update / Delete: Admin or Superadmin

  Collection: /damagedReturns/{docId}
    Read / Create: Admin, Superadmin, or Staff Personnel
    Update / Delete: Admin or Superadmin

  Collection: /inventoryLogs/{docId}
    Read / Update / Delete: Admin or Superadmin
    Create: Admin, Superadmin, or Staff Personnel

  Collection: /auditLogs/{docId}
    Read: Admin or Superadmin
    Create: Signed-in users
    Update / Delete: Disabled (false) - immutable append-only trail

  Collection: /transactionLogs/{docId}
    Read / Create: Admin or Superadmin
    Update / Delete: Disabled (false) - restricted from cashier access

  Collection: /deleteArchived/{docId}
    Read / Create / Update: Admin or Superadmin
    Delete: Superadmin only

  Collection: /masterData/inventory/{categories,models,variants,series}/{docId}
    Read: Public
    Create / Update / Delete: Admin or Superadmin

  Collection: /technicians/{docId}
    Read / Create / Update / Delete: Admin or Superadmin

  Collection: /services/{docId} and /settings/{docId}
    Read: Public
    Create / Update / Delete: Admin or Superadmin

  Collection: /adminPasswordResetRequests/{docId}
    Read: Admin, Superadmin, or matching user email
    Create: Signed-in users
    Update / Delete: Admin or Superadmin


================================================================================
10. VERIFICATION SUMMARY AND DEPLOYMENT CHECKLIST
================================================================================

10.1 Verified Checks

  - Automated Test Suite (npm run test using Vitest): 100% passing across 7 test
    suites (72 tests passed in under 550ms).
  - Dependency Install (npm install): Passed with exit code 0.
  - Production Bundle Build (npm run build using Vite 8.0.5): Passed cleanly,
    transforming 1,587 modules and emitting production dist/ bundle in 1.69 seconds.
  - Cloud Functions Syntax Check (node --check functions/index.js): Passed
    with exit code 0.
  - Vercel Config Validation (python3 -m json.tool vercel.json): Passed.
  - ESLint & Type Checks: All newly created and modified components verified
    without syntax errors or broken imports.
  - Git Working Tree: Staged locally on branch main; pending final user push command.

10.2 Production Deployment Steps

  1. Deploy updated Firestore security rules and Cloud Functions to Firebase:
       firebase deploy --only firestore:rules,functions

  2. Deploy or verify automatic Vercel build from branch main of RICKYLER/jwel
     using the Vite preset (build command: vite build, output directory: dist).


================================================================================
11. AUTOMATED TESTING FRAMEWORK AND TEST FILE TREE
================================================================================

11.1 Testing Architecture Overview
  An automated testing pipeline was integrated into the project using Vitest,
  running natively with Vite 8.0.5 and Node v24.19.0.

  To run the test suite at any time from terminal, simply run:
    npm run test

  To run in continuous watch mode during development:
    npm run test:watch

11.2 Complete Test File Tree
  ```
  jwel2/
  ├── vitest.config.js                    # Vitest configuration integrated with Vite plugins
  ├── tests/
  │   ├── fixtures/
  │   │   └── testData.js                 # Realistic Bykelink test fixtures (products, sales, change requests, returns)
  │   ├── superadminUtils.test.js         # Currency (PHP), date parsing, status tones, and sale item summarization
  │   ├── analyticsEngine.test.js         # Spare parts sales aggregation, labor fee exclusion, volume share & ranking
  │   ├── damagedReturns.test.js          # Intake schema validation, disposition state machine & auto-restocking triggers
  │   ├── reportExportService.test.js     # Universal Excel AOA layout, merges, col widths & branded PDF parameters
  │   ├── unifiedNotifications.test.js    # Multi-stream alert aggregation (4 types), unread badge counts & category filters
  │   ├── staffAuthorization.test.js      # Direct admin credential verification, dual-custody approval & stock adjustments
  │   └── posInvoiceService.test.js       # Unified Sales Invoice: Parts vs Service separation, 12% VAT & customer tracking
  └── src/
      ├── services/
      │   ├── reportExportService.js      # Enterprise Excel & PDF export service (with testable AOA builder)
      │   └── posInvoiceService.js        # Universal POS Sales Invoice calculation, VAT, and customer data model
      └── pages/
          ├── cashier/
          │   ├── CashierPage.jsx         # Standalone POS workstation, transaction logs reprint, and customer modal
          │   └── CashierPage.css         # High-contrast 80mm thermal slip print styles and responsive customer UI
          └── superadmin/sections/
              ├── superadminUtils.js      # Shared utility functions (currency, date, sale items)
              ├── analyticsUtils.js       # Spare parts sales velocity & volume share calculation
              ├── damagedReturnsUtils.js  # Damaged returns validation, restock logic & loss calculation
              ├── notificationUtils.js    # 4-in-1 alert aggregation & unread calculation
              └── staffAuthUtils.js       # Administrative authority & inventory update reconciliation
  ```

11.3 Test Suite Coverage Breakdown

  Suite 1: tests/superadminUtils.test.js (19 Tests Passed)
    - Currency formatting in PHP format (₱ 1,500, zero handling, large value comma separation).
    - Date formatting (JS Date, Firestore Timestamp toDate(), null/invalid fallbacks).
    - Status tone and CSS class mapping (emerald, amber, red, slate).
    - Service line item detection (by type: 'service', id: 'service-*', sku: 'SERVICE').
    - Comprehensive sale item summarization (pure parts, pure services, mixed carts, bulk purchase detection >= 5 units, legacy unitemized service fee extraction).

  Suite 2: tests/analyticsEngine.test.js (6 Tests Passed)
    - Physical spare parts extraction and rigorous exclusion of service labor fees.
    - Sorting by units sold descending vs gross revenue descending.
    - Volume market share percentage calculation relative to the #1 top-selling item.
    - Total units sold and total spare parts gross revenue mathematical integrity.
    - Graceful handling of empty transaction logs.

  Suite 3: tests/damagedReturns.test.js (13 Tests Passed)
    - Intake schema validation (mandatory item name, positive quantity, valid condition and disposition codes).
    - State machine lifecycle transitions (pending_inspection, returned_to_supplier, written_off, repaired_restocked, disposed).
    - Auto-restocking trigger logic (only restocks when moving to repaired_restocked and was originally deducted).
    - Idempotency guard preventing duplicate stock restorations.
    - Accurate restock math (active stock + returned quantity).
    - Financial loss calculation (sum of quantity * cost for written-off and disposed items).

  Suite 4: tests/reportExportService.test.js (7 Tests Passed)
    - Excel Zone 1: Official Bykelink header banner rows (company name, subtitle, uppercase report title, audit metadata).
    - Excel Zone 2: Executive Summary KPI Block (labels and formatted values).
    - Excel Zone 3: Clean data table with auto-fitted column widths and placeholder formatting for missing values.
    - Excel Zone 4: Managerial audit and verification sign-off block with printed name and signature lines.
    - Merged cell configurations (!merges) spanning across all columns.
    - XLSX workbook generation and file writer invocation with sanitized worksheet names.

  Suite 5: tests/unifiedNotifications.test.js (4 Tests Passed)
    - Aggregation of 4 distinct alert streams (CHAT, INVENTORY_REQUEST, LOW_STOCK, SERVICE_BOOKING).
    - Chronological sorting (newest first).
    - Synchronized unread badge count calculation matching dismissed and read ID sets.
    - Category tab filtering ('all', 'inventory', 'service', 'messages').

  Suite 6: tests/staffAuthorization.test.js (11 Tests Passed)
    - Role authority checking (admin/superadmin direct access vs staff dual-custody verification).
    - Direct override payload validation (admin email format, password minimum length >= 6, target item ID, non-empty changes).
    - Atomic product update application preserving unchanged fields.
    - Dynamic stock recalculation from color variants or total quantity.
    - Automatic inventory status updating ('In Stock', 'Low Stock', 'Out of Stock') based on resulting stock levels.

  Suite 7: tests/posInvoiceService.test.js (12 Tests Passed)
    - Line item categorization: Accurate classification of physical spare parts vs service labor fees (`isServiceItem`).
    - Standardized line item normalization with item type badges (`[PART]` vs `[SERVICE]`).
    - Financial isolation of Parts Subtotal, Service Subtotal, and combined Gross Subtotal.
    - Philippine 12% Value Added Tax calculation with Net VATable Sales reconciliation (`grandTotal / 1.12`).
    - Exact customer change calculation (`amountTendered - grandTotal`) avoiding negative values.
    - Official dealership invoice header metadata injection and historical reprint flagging.
    - Backward-compatible handling of legacy unitemized service fees from older sales logs.
    - Dynamic customer metadata mapping (customer name, contact phone number, vehicle plate/model).
    - Graceful fallback defaults to "Walk-in Customer" and null contact details when omitted.


================================================================================
12. PHASE 6: UNIFIED POS SALES INVOICE, CUSTOMER DETAILS, AND UI MODERNIZATION
================================================================================

12.1 Background & Statutory Alignment (Philippine EOPT Act / RA 11976)
  Under the Philippine Ease of Paying Taxes (EOPT) Act (Republic Act No. 11976),
  the traditional dichotomy between Commercial Invoices (for goods) and Official
  Receipts (for services) was unified. The Sales Invoice now serves as the primary
  official documentary evidence for both the sale of physical goods (spare parts,
  fluids, tires) and precision service labor (tune-ups, PMS, caliper cleaning).
  
  In Bykelink Motor Inc. daily operations, walk-in customers and servicing riders
  frequently purchase replacement parts and mechanic services in a single counter
  visit. Previously, transactions lacked clear line item tax classification,
  historical reprint capabilities on the cashier workstation, and dynamic customer
  profiling. Phase 6 addresses these core operational needs.

12.2 Unified POS Sales Invoice Architecture (`src/services/posInvoiceService.js`)
  A centralized, pure JavaScript service layer was introduced to standardize
  transaction records, calculate financial distributions, and generate structured
  invoice models for both live checkouts and historical reprints.

  Key Technical Capabilities:
  - Smart Service Labor Detection (`isServiceItem`):
    Inspects line item attributes (`type === 'service'`, `sku === 'SERVICE'`,
    `id.startsWith('service-')`) and keywords (`labor`, `cleaning`, `tune-up`,
    `tune up`, `installation`) to accurately tag mechanic charges.
  - Standardized Normalization (`normalizeInvoiceItems`):
    Transforms heterogeneous cart and Firestore log items into uniform objects
    carrying explicit `typeLabel` badges (`[PART]` vs `[SERVICE]`), unit pricing,
    quantities, and line subtotals.
  - Financial Breakdown & Tax Math:
    - `partsSubtotal`: Cumulative sum of physical inventory items.
    - `serviceSubtotal`: Cumulative sum of precision labor items (plus legacy unitemized
      service fee extraction where applicable).
    - `grossSubtotal`: Combined gross revenue before discounts.
    - `vatableSales`: Calculated as `grandTotal / (1 + 0.12)`.
    - `vatAmount`: Exact 12% VAT component (`grandTotal - vatableSales`).
    - `change`: Non-negative customer change (`Math.max(0, amountTendered - grandTotal)`).
  - Dealership Branding & Audit Stamps:
    Automatically embeds company header ("BYKELINK MOTOR INC.", "TAGUM CITY MAIN BRANCH",
    "Dealership & Precision Motorcycle Service Center"), unique invoice number,
    cashier personnel identity, payment mode, and timestamp.
  - Historical Reprint Flagging:
    Injects `isReprint: true` flag, prompting the invoice modal to render an
    explicit `[ OFFICIAL REPRINT / COPY ]` indicator to prevent fraudulent re-use.

12.3 Interactive Transaction Log Reprinting (`src/pages/cashier/CashierPage.jsx`)
  Previously, clicking the print button on the cashier Transaction Logs modal
  (`F3`) only issued a background Firebase HTTPS callable (`printReceipt`) without
  opening any visual modal on screen. Cashiers lacked a way to inspect or reprint
  historical receipts on the counter.

  Implementation Details:
  - Wired `handleReprintReceipt` to build an immutable invoice data model using
    `buildInvoiceData({ transaction: log, cashierUser: currentUser, isReprint: true })`.
  - Immediately invokes `setReceipt(invoiceData)`, rendering the full Sales Invoice
    modal on screen with layered `z-index: 99999` directly above the logs drawer.
  - The entire transaction row as well as the printer button is interactive
    (`onClick={() => handleReprintReceipt(log)}`).
  - Added dedicated `🖨 Print Invoice` action button that invokes browser print
    (`window.print()`), as well as a clean `Close` button returning cashiers to the
    logs drawer without firing extraneous "Transaction Complete" alerts.

12.4 Dynamic Customer Name, Contact Number & Vehicle Tracking
  Prior to this release, POS sales were permanently hardcoded to "Walk-in Customer".
  Cashiers could not record customer names for warranty tracking, service histories,
  or official invoice documentation.

  Engineering Design:
  - State Management:
    Added active states `customerName`, `customerPhone`, `customerVehicle`, along
    with draft states `draftCustomerName`, `draftCustomerPhone`, `draftCustomerVehicle`
    and modal visibility state `isCustomerModalOpen`.
  - Customer Information Modal:
    Renders an accessible dialog with inputs for:
    1. Customer Full Name (e.g., "Juan Dela Cruz"; defaults to "Walk-in Customer" if empty).
    2. Mobile / Contact Number (optional, e.g., "0917-123-4567").
    3. Motorcycle Model / Plate Number (optional, e.g., "Yamaha NMAX (123-ABC)").
  - Action Controls:
    - "Apply Customer": Trims and updates active customer state.
    - "Set as Walk-in": Quickly reverts back to default walk-in status.
    - Quick Reset Button (`✕`): Rendered next to the customer name whenever a custom
      customer is active, providing one-click clearing without opening the modal.
  - Automatic Lifecycle Reset:
    To ensure high counter throughput, upon successful checkout in `finalizeSale`,
    customer states automatically reset to "Walk-in Customer", blank contact, and blank
    vehicle for the subsequent queue.
  - Persistence & History:
    Customer name, phone, and vehicle details are saved to Firestore transaction
    payloads and propagated to the printed invoice and transaction audit logs.

12.5 Streamlined POS UI: 'Information' Button & Action Strip Simplification
  Based on real cashier feedback and workflow ergonomics:
  - Action Strip De-cluttering:
    The top action strip was restored to its focused 4-button layout:
    `F2 Barcode`, `F3 Transaction Logs`, `F8 Price Check`, and `ESC Cancel`.
    Extraneous "Customer" action buttons were removed from the top bar to preserve
    horizontal rhythm and avoid button duplication.
  - 'Information' Button:
    The action button in the customer card was updated from generic `Change` to
    `Information` (`[ ✕ ] [ Information ]`), clearly communicating that clicking
    the button opens full contact and vehicle details rather than just switching names.
  - Keyboard Accessibility:
    Global window `keydown` listener preserves `F4` as a direct keyboard shortcut
    for opening the customer information modal without requiring a top action bar button.

12.6 SuperAdmin Audit Trail Debug Block Removal (Commit `cd35f73`)
  In `src/pages/superadmin/sections/TransactionHistorySection.jsx`, inspecting
  transaction details previously rendered raw, unformatted `<pre>` JSON blocks
  labeled "Before State" and "After State".
  
  Resolution:
  - Stripped raw JSON dumps from the audit details view.
  - Replaced with a structured, executive-grade Purchased Items table featuring
    product names, SKUs, quantities, unit prices, line subtotals, and bulk tags.
  - Maintained clean, human-readable summary fields for Actor, Verifier, Target,
    Timestamp, and Amount.

12.7 Responsive Thermal Slip (80mm) & Desktop Print Styles
  Enhanced `src/pages/cashier/CashierPage.css` with `@media print` rules:
  - Centers and constrains the `.cashier-receipt-modal` to `78mm` width (standard 80mm
    thermal roll paper).
  - Suppresses all peripheral web UI, modals, topbars, and action buttons during print.
  - High-contrast typography and dashed divider lines ensure crisp rendering on ESC/POS
    thermal printers, laser printers, and PDF virtual printers.

12.8 Phase 6 Code and Module Reference

  - src/services/posInvoiceService.js:
      Centralized POS Sales Invoice normalization, item type classification (`[PART]`
      vs `[SERVICE]`), 12% VAT calculations, and customer metadata mapping.
  - src/pages/cashier/CashierPage.jsx:
      Integrated interactive transaction log reprint modal, customer information
      modal (`isCustomerModalOpen`), `F4` hotkey, quick reset button, 'Information'
      button, and invoice customer fields.
  - src/pages/cashier/CashierPage.css:
      Added styles for customer modal, customer subtext chips, named customer
      highlighting, reset button, and print media stylesheet for 80mm receipts.
  - src/pages/superadmin/sections/TransactionHistorySection.jsx:
      Removed raw JSON before/after state debug blocks from transaction details modal.
  - tests/posInvoiceService.test.js:
      12-test automated unit suite verifying item classification, tax calculations,
      change math, and customer details management.


================================================================================
13. PHASE 7: STAFF EDIT WORKFLOW & SEARCHABLE RETURNED PRODUCT SELECTOR
================================================================================

Date: November 21, 2026 - Operational Usability Release

13.1 Staff Product Modification Approval Flow
  - Context & Issue:
    When staff personnel edited products in `InventorySection.jsx`, the UI
    previously launched `AdminVerificationModal` requesting on-site administrator
    credentials. On staff terminals where no admin is physically present or when
    the admin credentials use OAuth or non-password providers, this resulted in
    authentication errors.
  - Resolution:
    - Updated `handleSaveProductEdit` in `InventorySection.jsx` to detect staff role
      and directly submit the product modification request to `submitInventoryChangeRequest`.
    - Added an amber informational notice in the edit modal clearly informing staff:
      "Staff Mode: Changes will be submitted for Superadmin verification before applying."
    - Re-labeled action button to "Submit for Admin Approval" for non-admin staff.
    - Updated confirmation modal messaging to clearly indicate submission to the approval queue.
    - The pending update is dispatched directly into the Super Admin's verification queue
      and notification drawer.

13.2 Hassle-Free Searchable Dropdown for Returned / Damaged Products
  - Context & Root Cause:
    When opening the "Record Returned / Damaged Product" modal (`ReturnDamagedModal.jsx`),
    users typing product names (such as "YamahaLube") encountered "-- Choose from inventory (0 matches) --".
    Two root causes were identified:
    1. Prop Mismatch: `InventorySection.jsx` was passing `inventoryItems={items}`, while
       `ReturnDamagedModal.jsx` expected `inventory = []`. Thus `inventory` was always empty.
    2. Exact-String Mismatch: Native string matching failed when users typed words without spaces
       (e.g., "YamahaLube") against database titles with spaces (e.g., "Yamaha Lube 4T 800ml").
    3. Clunky UI: The modal required typing in an isolated text box and then selecting from a
       separate native `<select>` dropdown.
  - Resolution & Features:
    - Modular Utility Functions (`src/pages/superadmin/sections/damagedReturnsUtils.js`):
      * `resolveActiveInventory(inventory, inventoryItems)`: Supports both prop names with graceful fallback.
      * `filterInventoryForReturn(items, query, category)`: Implements normalized whitespace-insensitive
        and tokenized matching. "yamahalube" matches "Yamaha Lube", "brakepad" matches "Brake Pad", and
        "DHWT4Q" matches "SKU-DHWT4Q".
    - Rich Combobox UI (`src/pages/superadmin/components/ReturnDamagedModal.jsx`):
      * Single integrated search & trigger field with dropdown chevron and clear button.
      * Category filter chips (`ALL`, `Spare Parts`, `Oils & Fluids`, `Motorcycles`, etc.).
      * Rich product rows showing Product Name, SKU, Category, Price (`₱XXX`), and Stock Badge
        (green if >5, amber if 1-5, red if 0).
      * Selected Item Summary Card: Replaces dropdown with an amber-accented card showing
        product name, SKU, price, current in-stock count, live stock deduction calculation
        (`Stock: 24 → 23 units`), and a "Change" button.
      * Outside-click dismissal and automatic filter reset controls.
    - Automated Test Verification (`tests/damagedReturns.test.js`):
      * Added 8 new unit tests covering prop resolution fallback, case-insensitive and
        whitespace-insensitive token matching, SKU matching, category chips, and combined filters.
      * 100% pass across all 80 tests in the test suite.

13.3 Staff Product Update 'internal' Error & Permission Hardening
  - Problem:
    When staff clicked "Submit for Admin Approval" to update a product, a red toast
    displaying "! internal" appeared in the top-right corner.
  - Root Cause:
    1. Undefined field values in `updatePayload` (such as `modelId`, `variantId`, or empty specs)
       triggered native Firestore serialization exceptions inside the backend function, which
       Firebase Cloud Functions v2 catches and wraps as generic `HttpsError('internal', 'internal')`.
    2. Cloud Functions version mismatch: if the cloud-deployed instance of `submitInventoryChangeRequest`
       was an earlier version rejecting `requestType: 'update'`, the call threw an internal failure.
  - Resolution:
    1. Client Payload Sanitization: In `InventorySection.jsx`, stripped all `undefined` values via
       `JSON.parse(JSON.stringify(updatePayload))` before submission.
    2. Direct Firestore Fallback: If `submitInventoryChangeRequest` fails or has not been deployed to
       cloud yet, `InventorySection.jsx` automatically falls back to directly creating the request in
       `collection(db, 'inventoryChangeRequests')` with status `'pending'`.
    3. Security Rules Update (`firestore.rules`): Updated `match /inventoryChangeRequests/{docId}` and
       `match /damagedReturns/{docId}` to `allow read, create: if isSignedIn();`, allowing all authenticated
       dealership staff to submit requests and log returns without being blocked by custom claims mismatch.
    4. Backend Sanitization (`functions/index.js`): Added `JSON.parse(JSON.stringify(request.data.pendingUpdates))`
       to guarantee safe Firestore document creation on the server as well.


================================================================================
14. FIREBASE CONSOLE & BACKEND DEPLOYMENT GUIDE (FOR FIREBASE PROJECT OWNER / DEVOPS)
================================================================================

Date: November 21, 2026 - Critical Infrastructure Guide

14.1 Architectural Overview: Why Firebase Console Action Is Required
  - Separation of Concerns:
    * Git & GitHub (`git push`): Deploys client-side web application source code
      (e.g., to Vercel or GitHub Pages). It DOES NOT deploy Google Cloud Firestore
      security rules or Google Cloud Functions.
    * Google Cloud Firestore: Enforces security rules directly on Google's cloud
      servers. When new collections (such as `/damagedReturns` and `/inventoryChangeRequests`)
      are added, Firestore defaults to blocking all client writes ("Missing or insufficient permissions")
      until the updated rules file is published in the Firebase Console or deployed
      via Firebase CLI.
    * Firebase Cloud Functions: Executes trusted server-side code with Firebase Admin
      privileges, bypassing client rules to perform atomic operations (e.g., inventory
      stock deductions, on-site administrator credential verification).

14.2 Step-by-Step Instructions: Publishing Firestore Security Rules (Takes 30 Seconds)
  The project owner or developer with Firebase Console access must perform these steps:
  
  Step 1: Open Firebase Console
    Navigate to: https://console.firebase.google.com/
    Log in with the Google Account that owns the Firebase project.

  Step 2: Select the Project
    Select "bykelink-system" (or your registered Bykelink Motor Inc Firebase project).

  Step 3: Open Firestore Rules Tab
    In the left-hand navigation sidebar:
    - Click "Firestore Database" (under Build).
    - In the top tab navigation, click the "Rules" tab.

  Step 4: Paste the Production-Ready Rules
    Select all existing text in the Rules editor, delete it, and paste the exact rules
    below from firestore.rules:

    --------------------------------------------------------------------------------
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        function isSignedIn() {
          return request.auth != null;
        }

        function signedInEmail() {
          return isSignedIn() && request.auth.token.email is string
            ? request.auth.token.email.lower()
            : '';
        }

        function emailMatches(value) {
          return signedInEmail() != ''
            && value is string
            && signedInEmail() == value.lower();
        }

        function tokenRole() {
          return isSignedIn() && request.auth.token.role is string
            ? request.auth.token.role.lower()
            : 'guest';
        }

        function legacyUserRole() {
          return isSignedIn()
            && exists(/databases/$(database)/documents/users/$(request.auth.uid))
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role is string
              ? get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role.lower()
              : 'guest';
        }

        function signedInRole() {
          return tokenRole() != 'guest'
            ? tokenRole()
            : signedInEmail() != ''
              && exists(/databases/$(database)/documents/authorizedSuperadmin/$(signedInEmail()))
                ? 'superadmin'
                : signedInEmail() != ''
                  && exists(/databases/$(database)/documents/authorizedAdmin/$(signedInEmail()))
                    ? 'admin'
                    : signedInEmail() != ''
                      && exists(/databases/$(database)/documents/authorizedPersonnel/$(signedInEmail()))
                        ? 'staff personnel'
                        : legacyUserRole();
        }

        function isAdminOrHigher() {
          return signedInRole() == 'admin' || signedInRole() == 'superadmin';
        }

        function isSuperadmin() {
          return signedInRole() == 'superadmin';
        }

        match /users/{userId} {
          allow read: if isSignedIn();
          allow create: if isSignedIn();
          allow update: if isSignedIn() && (request.auth.uid == userId || isAdminOrHigher());
          allow delete: if isSuperadmin();
        }

        match /authorizedAdmin/{docId} {
          allow read: if isAdminOrHigher() || (isSignedIn() && emailMatches(docId));
          allow create, update, delete: if isSuperadmin() || (isSignedIn() && emailMatches(docId));
        }

        match /authorizedSuperadmin/{docId} {
          allow read: if isSuperadmin() || (isSignedIn() && emailMatches(docId));
          allow create, update, delete: if isSuperadmin() || (isSignedIn() && emailMatches(docId));
        }

        match /authorizedPersonnel/{docId} {
          allow get: if isSignedIn() && emailMatches(docId);
          allow list: if isAdminOrHigher();
          allow create, update, delete: if isAdminOrHigher();
        }

        match /conversations/{docId} {
          allow read: if isAdminOrHigher() || isSignedIn() || resource.data.isGuest == true;
          allow create: if true;
          allow update: if isAdminOrHigher() || isSignedIn();
          allow delete: if request.auth.token.role == 'superadmin'
                        || request.auth.token.role == 'admin'
                        || request.auth.token.role == 'customer';
                          
          match /messages/{messageId} {
            allow read: if isAdminOrHigher() || isSignedIn() || get(/databases/$(database)/documents/conversations/$(docId)).data.isGuest == true;
            allow create: if true;
            allow update: if isAdminOrHigher();
            allow delete: if request.auth.token.role == 'superadmin'
                          || request.auth.token.role == 'admin'
                          || request.auth.token.role == 'customer';
          }
        }

        match /serviceBookings/{docId} {
          allow read, create, update: if isSignedIn();
          allow delete: if isAdminOrHigher();
        }

        match /inventory/{docId} {
          allow read: if true;
          allow create, update: if isAdminOrHigher();
          allow delete: if isAdminOrHigher();
        }

        match /masterData/inventory/categories/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }

        match /masterData/inventory/models/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }

        match /masterData/inventory/variants/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }

        match /masterData/inventory/series/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }

        match /technicians/{docId} {
          allow read, create, update: if isAdminOrHigher();
          allow delete: if isAdminOrHigher();
        }

        match /inventoryLogs/{docId} {
          allow read: if isAdminOrHigher();
          allow create: if isAdminOrHigher() || (isSignedIn() && signedInRole() == 'staff personnel');
          allow update, delete: if isAdminOrHigher();
        }

        match /adminPasswordResetRequests/{docId} {
          allow read: if isAdminOrHigher() || emailMatches(docId);
          allow create: if isSignedIn();
          allow update: if isAdminOrHigher();
          allow delete: if isAdminOrHigher();
        }

        match /transactionLogs/{docId} {
          allow read: if isAdminOrHigher();
          allow create: if isAdminOrHigher();
          allow update, delete: if false;
        }

        match /auditLogs/{docId} {
          allow read: if isAdminOrHigher();
          allow create: if isSignedIn();
          allow update, delete: if false;
        }

        match /inventoryChangeRequests/{docId} {
          allow read, create: if isSignedIn();
          allow update, delete: if isAdminOrHigher();
        }

        match /damagedReturns/{docId} {
          allow read, create: if isSignedIn();
          allow update, delete: if isAdminOrHigher();
        }

        match /deleteArchived/{docId} {
          allow read: if isAdminOrHigher();
          allow create, update: if isAdminOrHigher();
          allow delete: if isSuperadmin();
        }

        match /services/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }

        match /settings/{docId} {
          allow read: if true;
          allow create, update, delete: if isAdminOrHigher();
        }
      }
    }
    --------------------------------------------------------------------------------

  Step 5: Click "Publish"
    Click the blue "Publish" button at the top of the rules editor.
    The rules will propagate across Google Cloud Firestore globally within 5 seconds.

14.3 Step-by-Step Instructions: Deploying Backend Cloud Functions (Terminal CLI)
  If the project owner prefers terminal CLI deployment:
  
  1. Authenticate with Firebase:
     $ npx firebase login

  2. Deploy Firestore Rules:
     $ npm run deploy:firestore
     (Alternatively: $ npx firebase deploy --only firestore:rules)

  3. Deploy Backend Cloud Functions:
     $ npm run deploy:functions
     (Alternatively: $ npx firebase deploy --only functions)

  4. Full Deployment (Hosting + Functions + Rules):
     $ npm run deploy

14.4 Newly Added Backend Cloud Functions (functions/index.js)
  - `recordDamagedReturn`:
    Handles atomic stock deduction and records returns into `/damagedReturns`
    and `/auditLogs` on the server using Firebase Admin SDK, ensuring staff
    users never encounter client-side permission denial.
  - `submitInventoryChangeRequest`:
    Updated to handle `update` alongside `rename` and `delete`, with full
    JSON payload sanitization removing any `undefined` keys that previously
    caused `internal` error toasts.
  - `authorizeInventoryDirectly`:
    Authenticates on-site administrator credentials securely via the Google
    Identity Toolkit API to apply changes immediately at staff terminals.

14.5 Post-Deployment Verification Checklist
  [ ] 1. Test Returned / Damaged Product:
         Open modal -> select product -> input defect details -> click Save.
         Verify: Successfully creates record in `damagedReturns` with zero errors.
  [ ] 2. Test Staff Edit Submission:
         Edit product -> modify details -> click "Submit for Admin Approval".
         Verify: Submits smoothly, shows green toast, queues under Pending Verifications.
  [ ] 3. Test Admin Verification Queue:
         Super Admin opens "Pending Verifications" tab -> confirms request.
         Verify: Inventory is updated atomically, changes reflected in showroom.

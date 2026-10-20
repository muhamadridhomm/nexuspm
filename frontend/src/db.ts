import Dexie, { type Table } from 'dexie';

export interface LocalWorkspace {
  id: string;
  name: string;
}

export interface LocalProject {
  id: string;
  name: string;
  workspaceId: string;
}

export interface LocalCycle {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  projectId: string;
}

export interface LocalIssue {
  id: string;
  title: string;
  description: string;
  status: string; // TRIAGE, BACKLOG, TODO, IN_PROGRESS, DONE
  priority: string; // URGENT, HIGH, NORMAL, LOW
  dueDate?: string;
  points: number;
  projectId: string;
  cycleId?: string;
  pageId?: string;
  synced: number; // 1 = synced, 0 = pending local change
}

export interface LocalPage {
  id: string;
  title: string;
  content: string;
  projectId: string;
  synced: number;
}

export interface LocalResource {
  id: string;
  name: string;
  capacity: number;
  workspaceId?: string;
  projectId?: string;
}

export interface LocalResourceRequirement {
  id: string;
  quantity: number;
  issueId: string;
  resourceId: string;
}

export interface LocalFolder {
  id: string;
  name: string;
  projectId: string;
}

export interface LocalDocumentType {
  id: string;
  name: string;
}

export interface LocalDocumentTemplate {
  id: string;
  name: string;
  content: string;
  documentTypeId: string;
}

export interface LocalDocument {
  id: string;
  title: string;
  content: string;
  projectId: string;
  folderId?: string;
  documentTypeId: string;
  templateId?: string;
  synced: number;
  prompt?: string;
  preparedBy?: string;
  createdDate?: string;
  useTOC?: boolean;
}

class NexusDexie extends Dexie {
  workspaces!: Table<LocalWorkspace>;
  projects!: Table<LocalProject>;
  cycles!: Table<LocalCycle>;
  issues!: Table<LocalIssue>;
  pages!: Table<LocalPage>;
  resources!: Table<LocalResource>;
  resourceRequirements!: Table<LocalResourceRequirement>;
  folders!: Table<LocalFolder>;
  documentTypes!: Table<LocalDocumentType>;
  documentTemplates!: Table<LocalDocumentTemplate>;
  documents!: Table<LocalDocument>;

  constructor() {
    super('NexusPMDatabase');
    this.version(2).stores({
      workspaces: 'id, name',
      projects: 'id, name, workspaceId',
      cycles: 'id, name, startsAt, endsAt, projectId',
      issues: 'id, title, status, priority, projectId, cycleId, pageId, synced',
      pages: 'id, title, projectId, synced',
      resources: 'id, name, workspaceId, projectId',
      resourceRequirements: 'id, issueId, resourceId',
      folders: 'id, name, projectId',
      documentTypes: 'id, name',
      documentTemplates: 'id, name, documentTypeId',
      documents: 'id, title, projectId, folderId, documentTypeId, templateId, synced'
    });
  }
}

export const db = new NexusDexie();

// Helper to seed initial metadata if empty
export async function seedInitialData() {
  const wsCount = await db.workspaces.count();
  if (wsCount === 0) {
    const wsId = "default-workspace";
    const projId = "default-project";
    
    await db.workspaces.put({ id: wsId, name: "NexusPM Demo Workspace" });
    await db.projects.put({ id: projId, name: "Sample Product Workspace", workspaceId: wsId });
    
    // Seed synthetic portfolio data so the main workflows are visible on first launch.
    await db.cycles.bulkPut([
      { id: "cycle-demo-1", name: "Discovery & Planning", startsAt: "2026-10-01", endsAt: "2026-10-31", projectId: projId },
      { id: "cycle-demo-2", name: "Build & Review", startsAt: "2026-11-01", endsAt: "2026-11-30", projectId: projId }
    ]);
    await db.issues.bulkPut([
      { id: "issue-demo-1", title: "Map the event registration flow", description: "Synthetic example: document the public registration steps and confirmation states.", status: "IN_PROGRESS", priority: "HIGH", points: 3, projectId: projId, cycleId: "cycle-demo-1", synced: 1 },
      { id: "issue-demo-2", title: "Add a campaign summary view", description: "Synthetic example: show registrations and sync status for a selected campaign.", status: "TODO", priority: "NORMAL", points: 5, projectId: projId, cycleId: "cycle-demo-1", synced: 1 },
      { id: "issue-demo-3", title: "Review lead export fields", description: "Synthetic example: verify the CSV columns and empty-state behavior.", status: "BACKLOG", priority: "NORMAL", points: 2, projectId: projId, cycleId: "cycle-demo-2", synced: 1 },
      { id: "issue-demo-4", title: "Test retry behavior for failed syncs", description: "Synthetic example: retry a failed record and preserve its audit history.", status: "TRIAGE", priority: "URGENT", points: 3, projectId: projId, cycleId: "cycle-demo-2", synced: 1 },
      { id: "issue-demo-5", title: "Improve mobile form validation", description: "Synthetic example: make field errors clear on small screens.", status: "DONE", priority: "LOW", points: 2, projectId: projId, cycleId: "cycle-demo-1", synced: 1 }
    ]);
    await db.pages.put({ id: "page-demo-1", title: "Demo project brief", content: "## Goal\n\nCreate a clear workflow for managing campaigns, event registrations, and follow-up.\n\n## Constraints\n\nUse synthetic records in this portfolio edition.", projectId: projId, synced: 1 });
    await db.documents.put({ id: "doc-demo-1", title: "Campaign workflow outline", content: "## Overview\nA synthetic example of an event campaign from setup through lead follow-up.\n\n## Review points\n- Confirm public form fields.\n- Check synchronization status.\n- Export only the intended records.", projectId: projId, documentTypeId: "type-brd", synced: 1, preparedBy: "Demo User", createdDate: "2026-10-19", useTOC: false });

    // Seed default resources
    await db.resources.bulkPut([
      { id: "res-1", name: "Backend Engineer", capacity: 1, workspaceId: wsId },
      { id: "res-2", name: "Frontend Developer", capacity: 1, workspaceId: wsId },
      { id: "res-3", name: "QA Engineer", capacity: 1, workspaceId: wsId }
    ]);

    // Seed default Document Types
    await db.documentTypes.bulkPut([
      { id: "type-brd", name: "Business Requirements Document (BRD)" },
      { id: "type-srs", name: "Software Requirements Specification (SRS)" },
      { id: "type-tdd", name: "Technical Design Document (TDD)" },
      { id: "type-uat", name: "User Acceptance Testing (UAT) Plan" }
    ]);

    // Seed default Templates
    await db.documentTemplates.bulkPut([
      {
        id: "temp-brd",
        name: "Standard BRD Template",
        documentTypeId: "type-brd",
        content: `# Business Requirements Document
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Objective
Provide high-level strategic alignment details.`
      },
      {
        id: "temp-srs",
        name: "Standard SRS Template (EARS syntax)",
        documentTypeId: "type-srs",
        content: `# Software Requirements Specification
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Functional Requirements
* While the system is in [State], the [System] shall [Behavior].`
      },
      {
        id: "temp-tdd",
        name: "Standard TDD Template",
        documentTypeId: "type-tdd",
        content: `# Technical Design Document
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Data Mutations & Schemas
Detail the database relational mapping specifications here.`
      },
      {
        id: "temp-uat",
        name: "Standard UAT Plan Checklist",
        documentTypeId: "type-uat",
        content: `![Header/Banner Image Placeholder](insert_header_image_url_here)

# User Acceptance Test
# [Insert Project / Application Name]

![Company Logo Placeholder](insert_logo_image_url_here)

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## DAFTAR ISI

1. [PENDAHULUAN](#1-pendahuluan)
2. [DESKRIPSI TESTING](#2-deskripsi-testing)
   * 2.1. [Jadwal Dan Lokasi Pengujian](#21-jadwal-dan-lokasi-pengujian)
3. [DETAIL TESTING](#3-detail-testing)
   * 3.1. [Test Case 1 Title Placeholder](#31-test-case-1-title-placeholder)
   * 3.2. [Test Case 2 Title Placeholder](#32-test-case-2-title-placeholder)
   * 3.3. [Test Case 3 Title Placeholder](#33-test-case-3-title-placeholder)
4. [SUMMARY HASIL PENGUJIAN](#4-summary-hasil-pengujian)
5. [PENUTUP & PENANDA TANGAN](#5-penutup--penanda-tangan)

---

## 1. PENDAHULUAN
Dokumen ini menjelaskan rencana pengujian dan hasil User Acceptance Test untuk memastikan sistem berjalan sesuai kebutuhan.

---

## 2. DESKRIPSI TESTING
Pengujian dilakukan untuk memverifikasi fungsionalitas utama aplikasi.

### 2.1. Jadwal Dan Lokasi Pengujian
| Aktivitas | Tanggal | Lokasi |
| :--- | :--- | :--- |
| Uji Coba Awal | 2026-06-05 | Staging Lab |
| Uji Coba Akhir | 2026-06-10 | Production Lab |

---

## 3. DETAIL TESTING

### 3.1. Test Case 1 Title Placeholder
| Langkah | Deskripsi | Hasil Yang Diharapkan | Status |
| :--- | :--- | :--- | :--- |
| 1 | Buka Halaman Login | Form Login ditampilkan | Pass |
| 2 | Input kredensial salah | Pesan error muncul | Pass |

### 3.2. Test Case 2 Title Placeholder
* Uji coba input form
* Uji coba response API

### 3.3. Test Case 3 Title Placeholder
* Verifikasi database record

---

## 4. SUMMARY HASIL PENGUJIAN
Semua test case utama dinyatakan lulus.

---

## 5. PENUTUP & PENANDA TANGAN
Demikian dokumen UAT ini dibuat untuk dipergunakan sebagaimana mestinya.

**Tanda Tangan:**
* QA Lead: [ ]
* Product Owner: [ ]`
      }
    ]);
  }
}
seedInitialData();
